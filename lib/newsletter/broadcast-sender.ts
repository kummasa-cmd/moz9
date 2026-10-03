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
  formatKstTime,
  preflightBlockedOutcome,
  type CampaignTiming,
  type ExistingBroadcastRun,
} from "./broadcast-run";
import {
  describePreflightIssues,
  runBroadcastPreflight,
  type PreflightResult,
  type PreflightClient,
} from "./broadcast-preflight";
import {
  checkBroadcastTestPreflight,
  checkBroadcastTestRun,
  runBroadcastTestPreflight,
  type BroadcastTestTarget,
} from "./broadcast-test-run";
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

export type BroadcastCampaignDeps = {
  createClient: () => ResendBroadcastsClient & PreflightClient;
  runPreflight: (db: AdminClient, client: PreflightClient, segmentId: string) => Promise<PreflightResult>;
  // B2 only: same checks minus the eligible-gap comparison (broadcast-test-run.ts).
  runTestPreflight: (db: AdminClient, client: PreflightClient, segmentId: string) => Promise<PreflightResult>;
  loadTiming: (db: AdminClient, campaignId: string) => Promise<CampaignTiming>;
  getRecipientCount: () => Promise<number>;
  assignIssueNumber: (newsletterId: string) => Promise<number | null>;
  renderHtml: (newsletter: BroadcastNewsletter, issueNumber: number | null) => Promise<string>;
  createStore: (db: AdminClient) => BroadcastRunStore;
  recordUsage: (postIds: string[]) => Promise<void>;
};

async function loadCampaignTiming(db: AdminClient, campaignId: string): Promise<CampaignTiming> {
  const { data, error } = await db
    .from("newsletter_campaigns")
    .select("send_type, scheduled_at, recurring_time, created_at")
    .eq("id", campaignId)
    .single();
  if (error) throw new Error(`캠페인 일정 조회 실패: ${error.message}`);
  return data as CampaignTiming;
}

const defaultDeps: BroadcastCampaignDeps = {
  createClient: () => createBroadcastsClient(),
  runPreflight: (db, client, segmentId) => runBroadcastPreflight(db, client, segmentId),
  runTestPreflight: (db, client, segmentId) => runBroadcastTestPreflight(db, client, segmentId),
  loadTiming: loadCampaignTiming,
  getRecipientCount: async () => (await getTargetSubscribers({ targetAll: true, targetTags: [] })).length,
  assignIssueNumber: assignNewsletterIssueNumber,
  renderHtml: renderBroadcastHtml,
  createStore: createBroadcastRunStore,
  recordUsage: recordBoardPostNewsletterUsage,
};

// Called by processCampaign after it has claimed the campaign (SENDING).
// Throws on failure; processCampaign's catch marks the campaign FAILED with
// the message, same as for the legacy path. A preflight block is handled
// here instead (SCHEDULED for a retry, or FAILED) and returned as ok:false.
//
// Order matters: the preflight runs before anything with a side effect —
// before the run row is reserved, the issue number assigned, or any
// Broadcast API call — so a blocked send leaves no trace but last_error.
export async function sendClaimedCampaignViaBroadcast(
  db: AdminClient,
  campaign: BroadcastCampaign,
  newsletter: BroadcastNewsletter,
  now: Date,
  overrides: Partial<BroadcastCampaignDeps> = {},
): Promise<ProcessCampaignResult> {
  const deps = { ...defaultDeps, ...overrides };

  // Belt and braces — selectCampaignDeliveryPath already keeps these out.
  if (campaign.audience !== "SUBSCRIBERS") {
    throw new Error("홍보 뉴스레터는 Broadcast로 발송하지 않습니다.");
  }

  const segment = resolveBroadcastSegment("campaign");
  if (!segment.ok) throw new Error(segment.error);

  const client = deps.createClient();

  const preflight = await deps.runPreflight(db, client, segment.segmentId);
  if (!preflight.ok) {
    const timing = await deps.loadTiming(db, campaign.id);
    const outcome = preflightBlockedOutcome(timing, now);
    const reason = describePreflightIssues(preflight.blocking);
    const next =
      outcome.status === "SCHEDULED"
        ? `Contact 동기화 복구 후 자동 재시도 (~${formatKstTime(outcome.retryUntil)}까지)`
        : "자동 재시도 시간 초과 — 관리자 확인 필요";
    const lastError = truncate(`[preflight] Broadcast 발송 차단: ${reason} · ${next}`);

    const { error } = await db
      .from("newsletter_campaigns")
      .update({ status: outcome.status, last_error: lastError })
      .eq("id", campaign.id);
    if (error) throw new Error(`Broadcast 사전 점검 결과 기록 실패: ${error.message}`);

    console.error("[newsletter] Broadcast preflight blocked:", campaign.id, outcome.status, reason);
    return { ok: false, error: lastError };
  }
  if (preflight.warnings.length > 0) {
    console.warn("[newsletter] Broadcast preflight warnings:", campaign.id, describePreflightIssues(preflight.warnings));
  }

  // The segment mirrors exactly these rows (SUBSCRIBED, not suppressed) via
  // the 2단계 Contact sync; the count is kept as the run's estimate.
  const estimate = await deps.getRecipientCount();

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

  const issueNumber = await deps.assignIssueNumber(newsletter.id);
  const html = await deps.renderHtml(newsletter, issueNumber);

  const result = await executeBroadcastRun(
    {
      campaignId: campaign.id,
      newsletterId: newsletter.id,
      runKey: broadcastRunKey(campaign.send_type, now),
      segmentId: segment.segmentId,
      recipientEstimate: estimate,
      content: { from: newsletterFromAddress(), subject: newsletter.subject, html },
    },
    { store: deps.createStore(db), client },
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

  await deps.recordUsage(getSourcePostIds((newsletter.blocks as ContentBlock[] | null) ?? []));

  return { ok: true, sent: estimate, recipients: estimate, failed: 0, broadcastId: result.broadcastId };
}

// B2 (broadcast-test-run.ts): the same claimed-campaign Broadcast run, sent
// to the verified TEST segment only. Called by processCampaign only when the
// B2 script passes { broadcastTest }. Differences from the function above:
//   - segment: resolveBroadcastSegment("test") via checkBroadcastTestRun —
//     the real segment is never resolved here;
//   - preflight: segment-scoped (no eligible-gap check), and a block is an
//     error (processCampaign marks the campaign FAILED) instead of a retry;
//   - recipients: the test segment's subscribed Contacts (1..5), not Supabase;
//   - no issue number and no board-post usage count.
// Throws on any failure; nothing here falls back to the legacy sender or to
// the real segment.
export async function sendClaimedTestCampaignViaBroadcast(
  db: AdminClient,
  campaign: BroadcastCampaign & { target_all: boolean; target_tags: string[] | null; scheduled_at: string | null },
  newsletter: BroadcastNewsletter,
  now: Date,
  target: BroadcastTestTarget,
  overrides: Partial<BroadcastCampaignDeps> = {},
): Promise<ProcessCampaignResult> {
  const deps = { ...defaultDeps, ...overrides };

  const run = checkBroadcastTestRun(campaign, target);
  if (!run.ok) throw new Error(run.error);

  const client = deps.createClient();

  const audience = checkBroadcastTestPreflight(await deps.runTestPreflight(db, client, run.segmentId));
  if (!audience.ok) throw new Error(audience.error);
  const recipients = audience.recipients;

  await db.from("newsletter_campaigns").update({ total_recipients: recipients }).eq("id", campaign.id);

  const html = await deps.renderHtml(newsletter, null);

  const result = await executeBroadcastRun(
    {
      campaignId: campaign.id,
      newsletterId: newsletter.id,
      runKey: broadcastRunKey(campaign.send_type, now),
      segmentId: run.segmentId,
      recipientEstimate: recipients,
      content: { from: newsletterFromAddress(), subject: newsletter.subject, html },
    },
    { store: deps.createStore(db), client },
  );

  if (!result.ok) throw new Error(result.error);

  await db
    .from("newsletter_campaigns")
    .update({
      status: campaignStatusAfterRun({
        sendType: campaign.send_type,
        rangeEnd: campaign.range_end,
        recipients,
        sent: recipients,
        now,
      }),
      sent_at: new Date().toISOString(),
      last_sent_date: kstDateString(now),
      total_sent: recipients,
      total_failed: 0,
      last_error: null,
    })
    .eq("id", campaign.id);

  return { ok: true, sent: recipients, recipients, failed: 0, broadcastId: result.broadcastId };
}
