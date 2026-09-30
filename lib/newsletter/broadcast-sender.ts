import { createAdminClient } from "@/lib/supabase/admin";
import { getAdBannerIds, getSourcePostIds, type ContentBlock } from "./blocks/types";
import { renderBlocksToHtml } from "./blocks/email-renderer";
import { getAdBannersByIds, assignNewsletterIssueNumber, getTargetSubscribers, recordBoardPostNewsletterUsage } from "./queries";
import { newsletterConfig } from "./config";
import { buildEmailTemplate, toBroadcastHtml } from "./email";
import { campaignStatusAfterRun } from "./campaign-due";
import { kstDateString } from "./schedule-time";
import { resolveBroadcastSegment } from "./delivery-mode";
import {
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  buildBroadcastPayload,
  createBroadcastDraft,
  createBroadcastsClient,
  redactSecrets,
  sendBroadcast,
  type BroadcastContent,
  type ResendBroadcastsClient,
} from "./resend-broadcasts";
import type { RetryOptions } from "./resend-contacts";
import {
  broadcastName,
  broadcastRunKey,
  decideExistingBroadcastRun,
  type ExistingBroadcastRun,
} from "./broadcast-run";
import type { ProcessCampaignResult } from "./scheduler";

// Broadcast send path for the regular newsletter (3단계). Only reached when
// NEWSLETTER_DELIVERY_MODE=broadcast (see delivery-mode.ts); the legacy
// resend.batch.send() path in scheduler.ts is untouched.
//
// Duplicate-send guard, in order:
//   1. processCampaign's claim (SCHEDULED → SENDING) — same as legacy.
//   2. newsletter_broadcast_sends row, unique (campaign_id, run_key),
//      inserted before any Resend call.
//   3. The Broadcast is created as a draft, its id stored, and only then
//      sent. If anything fails after the draft exists, the row keeps the id
//      and further runs are refused rather than risk a second Broadcast.
//
// Broadcast runs create no newsletter_deliveries rows: there is no
// per-recipient send to record, and our open/click tracking needs
// per-delivery tokens (see email.ts::toBroadcastHtml).

type AdminClient = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Same template as the legacy path, with Resend's unsubscribe placeholder
// instead of ours and without our per-delivery tracking.
export async function renderBroadcastHtml(
  newsletter: { id: string; slug: string; blocks: unknown; published_at: string | null },
  issueNumber: number | null,
): Promise<string> {
  const blocks = (newsletter.blocks as ContentBlock[] | null) ?? [];
  const banners = await getAdBannersByIds(getAdBannerIds(blocks));
  const bodyHtml = renderBlocksToHtml(blocks, {
    brandColor: newsletterConfig.brandColor,
    banners,
    newsletterId: newsletter.id,
    slug: newsletter.slug,
  });
  const templateHtml = buildEmailTemplate(bodyHtml, {
    newsletterId: newsletter.id,
    slug: newsletter.slug,
    publishedAt: newsletter.published_at,
    issueNumber,
    isPromotional: false,
  });
  return toBroadcastHtml(templateHtml, RESEND_UNSUBSCRIBE_PLACEHOLDER);
}

export function newsletterFromAddress(): string {
  return `${newsletterConfig.senderName} <${newsletterConfig.senderEmail}>`;
}

// ---------------------------------------------------------------------------
// Core run (storage injected so it can be unit-tested)
// ---------------------------------------------------------------------------

export type ReserveInput = {
  campaignId: string;
  newsletterId: string;
  runKey: string;
  segmentId: string;
  recipientEstimate: number;
};

export type BroadcastRunStore = {
  // Inserts the run row. On a (campaign_id, run_key) conflict returns the
  // existing row instead.
  reserve(input: ReserveInput): Promise<{ ok: true; rowId: string } | { ok: false; existing: ExistingBroadcastRun & { id: string } }>;
  // Atomically takes over a FAILED row that has no broadcast id. False if
  // another run changed it first.
  reuse(rowId: string, input: ReserveInput): Promise<boolean>;
  markDraft(rowId: string, broadcastId: string): Promise<void>;
  markSendRequested(rowId: string, scheduledAt: string | null): Promise<void>;
  markFailed(rowId: string, error: string): Promise<void>;
};

export type BroadcastRunInput = ReserveInput & {
  content: Omit<BroadcastContent, "segmentId" | "name">;
  scheduledAt?: string | null;
};

export type BroadcastRunResult =
  | { ok: true; broadcastId: string; rowId: string }
  | { ok: false; error: string; duplicate?: boolean };

export async function executeBroadcastRun(
  input: BroadcastRunInput,
  deps: { store: BroadcastRunStore; client: ResendBroadcastsClient; retry?: RetryOptions },
): Promise<BroadcastRunResult> {
  const { store, client } = deps;

  // Validate before reserving, so bad content never leaves a row behind.
  const payload = buildBroadcastPayload({
    ...input.content,
    segmentId: input.segmentId,
    name: broadcastName({ subject: input.content.subject, runKey: input.runKey, campaignId: input.campaignId }),
  });
  if (!payload.ok) return { ok: false, error: payload.error };

  const reserved = await store.reserve(input);
  let rowId: string;
  if (reserved.ok) {
    rowId = reserved.rowId;
  } else {
    const refuse = {
      ok: false as const,
      duplicate: true,
      error:
        `이 캠페인의 같은 실행분(${input.runKey}) Broadcast가 이미 있습니다 ` +
        `(상태 ${reserved.existing.status}${reserved.existing.resend_broadcast_id ? `, Broadcast ${reserved.existing.resend_broadcast_id}` : ""}). ` +
        "중복 발송을 막기 위해 중단합니다. Resend 대시보드에서 확인해 주세요.",
    };
    if (decideExistingBroadcastRun(reserved.existing) === "refuse") return refuse;
    if (!(await store.reuse(reserved.existing.id, input))) return refuse;
    rowId = reserved.existing.id;
  }

  const draft = await createBroadcastDraft(client, payload.payload, deps.retry);
  if (!draft.ok) {
    await store.markFailed(rowId, `Broadcast 생성 실패: ${draft.error}`);
    return { ok: false, error: `Broadcast 생성 실패: ${draft.error}` };
  }

  try {
    await store.markDraft(rowId, draft.broadcastId);
  } catch (err) {
    // The draft exists but isn't recorded. Stop here: nothing was sent, and
    // the row stays CREATING so no later run creates another one blindly.
    const message = redactSecrets(err instanceof Error ? err.message : String(err));
    return {
      ok: false,
      error: `Broadcast 초안(${draft.broadcastId}) 기록 실패로 발송하지 않았습니다: ${message}`,
    };
  }

  const sent = await sendBroadcast(client, draft.broadcastId, { scheduledAt: input.scheduledAt ?? null }, deps.retry);
  if (!sent.ok) {
    // Keeps resend_broadcast_id, so this run is never retried automatically —
    // the send may or may not have reached Resend.
    await store.markFailed(rowId, `Broadcast 발송 요청 실패: ${sent.error}`);
    return { ok: false, error: `Broadcast 발송 요청 실패: ${sent.error}` };
  }

  try {
    await store.markSendRequested(rowId, input.scheduledAt ?? null);
  } catch (err) {
    // Resend already accepted the send; the row still carries the id (DRAFT),
    // which is enough to block a second Broadcast. Don't report a failure
    // for mail that did go out.
    console.error(
      "[newsletter] Broadcast 발송 상태 기록 실패:",
      draft.broadcastId,
      redactSecrets(err instanceof Error ? err.message : String(err)),
    );
  }

  return { ok: true, broadcastId: draft.broadcastId, rowId };
}

// ---------------------------------------------------------------------------
// Supabase wiring
// ---------------------------------------------------------------------------

const UNIQUE_VIOLATION = "23505";

function truncate(text: string): string {
  return text.length > 500 ? `${text.slice(0, 500)}…` : text;
}

export function createBroadcastRunStore(db: AdminClient): BroadcastRunStore {
  const table = () => db.from("newsletter_broadcast_sends");

  return {
    async reserve(input) {
      const { data, error } = await table()
        .insert({
          campaign_id: input.campaignId,
          newsletter_id: input.newsletterId,
          run_key: input.runKey,
          segment_id: input.segmentId,
          recipient_estimate: input.recipientEstimate,
          status: "CREATING",
        })
        .select("id")
        .single();

      if (!error) return { ok: true, rowId: data.id as string };
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`Broadcast 실행 기록 생성 실패: ${error.message}`);

      const { data: existing, error: loadError } = await table()
        .select("id, status, resend_broadcast_id")
        .eq("campaign_id", input.campaignId)
        .eq("run_key", input.runKey)
        .single();
      if (loadError) throw new Error(`Broadcast 실행 기록 조회 실패: ${loadError.message}`);
      return { ok: false, existing: existing as ExistingBroadcastRun & { id: string } };
    },

    async reuse(rowId, input) {
      const { data, error } = await table()
        .update({
          status: "CREATING",
          segment_id: input.segmentId,
          recipient_estimate: input.recipientEstimate,
          last_error: null,
        })
        .eq("id", rowId)
        .eq("status", "FAILED")
        .is("resend_broadcast_id", null)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(`Broadcast 실행 기록 재사용 실패: ${error.message}`);
      return data !== null;
    },

    async markDraft(rowId, broadcastId) {
      const { error } = await table()
        .update({ status: "DRAFT", resend_broadcast_id: broadcastId })
        .eq("id", rowId);
      if (error) throw new Error(error.message);
    },

    async markSendRequested(rowId, scheduledAt) {
      const { error } = await table()
        .update({ status: "SEND_REQUESTED", send_requested_at: new Date().toISOString(), scheduled_at: scheduledAt })
        .eq("id", rowId);
      if (error) throw new Error(error.message);
    },

    async markFailed(rowId, message) {
      const { error } = await table()
        .update({ status: "FAILED", last_error: truncate(redactSecrets(message)) })
        .eq("id", rowId);
      if (error) console.error("[newsletter] Broadcast 실패 상태 기록 실패:", rowId, error.message);
    },
  };
}

export type BroadcastCampaign = {
  id: string;
  send_type: string;
  range_end: string | null;
  audience: string;
};

export type BroadcastNewsletter = {
  id: string;
  slug: string;
  subject: string;
  blocks: unknown;
  published_at: string | null;
};

// Called by processCampaign after it has claimed the campaign (SENDING).
// Throws on failure; processCampaign's catch marks the campaign FAILED with
// the message, same as for the legacy path.
export async function sendClaimedCampaignViaBroadcast(
  db: AdminClient,
  campaign: BroadcastCampaign,
  newsletter: BroadcastNewsletter,
  now: Date,
): Promise<ProcessCampaignResult> {
  // Belt and braces — selectCampaignDeliveryPath already keeps these out.
  if (campaign.audience !== "SUBSCRIBERS") {
    throw new Error("홍보 뉴스레터는 Broadcast로 발송하지 않습니다.");
  }

  const segment = resolveBroadcastSegment("campaign");
  if (!segment.ok) throw new Error(segment.error);

  // The segment mirrors exactly these rows (SUBSCRIBED, not suppressed) via
  // the 2단계 Contact sync; the count is kept as the run's estimate.
  const recipients = await getTargetSubscribers({ targetAll: true, targetTags: [] });
  const estimate = recipients.length;

  await db.from("newsletter_campaigns").update({ total_recipients: estimate }).eq("id", campaign.id);

  if (estimate === 0) {
    await db
      .from("newsletter_campaigns")
      .update({
        status: campaignStatusAfterRun({ sendType: campaign.send_type, rangeEnd: campaign.range_end, recipients: 0, sent: 0, now }),
        sent_at: now.toISOString(),
        last_sent_date: kstDateString(now),
        total_sent: 0,
        total_failed: 0,
      })
      .eq("id", campaign.id);
    return { ok: true, sent: 0, recipients: 0, failed: 0 };
  }

  const issueNumber = await assignNewsletterIssueNumber(newsletter.id);
  const html = await renderBroadcastHtml(newsletter, issueNumber);

  const result = await executeBroadcastRun(
    {
      campaignId: campaign.id,
      newsletterId: newsletter.id,
      runKey: broadcastRunKey(campaign.send_type, now),
      segmentId: segment.segmentId,
      recipientEstimate: estimate,
      content: { from: newsletterFromAddress(), subject: newsletter.subject, html },
    },
    { store: createBroadcastRunStore(db), client: createBroadcastsClient() },
  );

  if (!result.ok) throw new Error(result.error);

  // "Sent" here means Resend accepted the Broadcast for the whole segment;
  // per-recipient delivery/bounce numbers arrive via the 4단계 webhook.
  await db
    .from("newsletter_campaigns")
    .update({
      status: campaignStatusAfterRun({
        sendType: campaign.send_type,
        rangeEnd: campaign.range_end,
        recipients: estimate,
        sent: estimate,
        now,
      }),
      sent_at: new Date().toISOString(),
      last_sent_date: kstDateString(now),
      total_sent: estimate,
      total_failed: 0,
      last_error: null,
    })
    .eq("id", campaign.id);

  await recordBoardPostNewsletterUsage(getSourcePostIds((newsletter.blocks as ContentBlock[] | null) ?? []));

  return { ok: true, sent: estimate, recipients: estimate, failed: 0, broadcastId: result.broadcastId };
}
