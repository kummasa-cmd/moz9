import { createAdminClient } from "@/lib/supabase/admin";
import { getAdBannerIds, getSourcePostIds, type ContentBlock } from "./blocks/types";
import { renderBlocksToHtml } from "./blocks/email-renderer";
import {
  assignNewsletterIssueNumber,
  getAdBannersByIds,
  getTargetProspects,
  getTargetSubscribers,
  recordBoardPostNewsletterUsage,
} from "./queries";
import { newsletterConfig } from "./config";
import { buildEmailTemplate, chunk, getResendClient, personalizeEmail } from "./email";
import { campaignStatusAfterRun, isCampaignDue, type DueCampaign } from "./campaign-due";
import { kstDateString } from "./schedule-time";
import { resolveDeliveryMode, selectCampaignDeliveryPath } from "./delivery-mode";
import { sendClaimedCampaignViaBroadcast } from "./broadcast-sender";

// Resend's batch endpoint accepts at most 100 emails per call.
const SEND_BATCH_SIZE = 100;
// Kept well under PostgREST's max-rows so the upsert's returned rows (which
// drive who actually gets sent to) are never truncated.
const DELIVERY_UPSERT_CHUNK_SIZE = 500;

type AdminClient = ReturnType<typeof createAdminClient>;

type DeliveryRow = {
  id: string;
  subscriber_id: string | null;
  prospect_id: string | null;
  tracking_token: string;
};

export type ProcessCampaignResult =
  // broadcastId is set only when the run went out as a Resend Broadcast.
  | { ok: true; sent: number; recipients: number; failed: number; broadcastId?: string }
  | { ok: false; error: string; skipped?: boolean };

// "schedule": cron / immediate-after-save — sends only if the campaign is
// still SCHEDULED and (for RECURRING/RANGE) hasn't already gone out today.
// "manual": the admin "지금 발송" button — still requires SCHEDULED, but is
// allowed to send a RECURRING/RANGE campaign again on the same day.
export type ProcessCampaignTrigger = "schedule" | "manual";

// Atomically moves the campaign SCHEDULED -> SENDING. Every trigger (GitHub
// Actions cron, Vercel cron, the admin buttons) goes through this, so two
// overlapping triggers can't both send: the loser's UPDATE matches no row.
// RECURRING/RANGE campaigns return to SCHEDULED after each run, so status
// alone can't stop a second trigger later the same day — the last_sent_date
// check is part of the same UPDATE for that reason.
async function claimCampaign(
  db: AdminClient,
  campaign: { id: string; send_type: string },
  trigger: ProcessCampaignTrigger,
  now: Date,
): Promise<boolean> {
  let query = db
    .from("newsletter_campaigns")
    .update({ status: "SENDING", sending_started_at: now.toISOString(), last_error: null })
    .eq("id", campaign.id)
    .eq("status", "SCHEDULED");

  const isDaily = campaign.send_type === "RECURRING" || campaign.send_type === "RANGE";
  if (trigger === "schedule" && isDaily) {
    query = query.or(`last_sent_date.is.null,last_sent_date.neq.${kstDateString(now)}`);
  }

  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}

async function upsertDeliveries(
  db: AdminClient,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<DeliveryRow[]> {
  const result: DeliveryRow[] = [];
  for (const part of chunk(rows, DELIVERY_UPSERT_CHUNK_SIZE)) {
    const { data, error } = await db
      .from("newsletter_deliveries")
      .upsert(part, { onConflict })
      .select("id, subscriber_id, prospect_id, tracking_token");
    if (error) throw new Error(`발송 기록 생성 실패: ${error.message}`);
    result.push(...((data ?? []) as DeliveryRow[]));
  }
  return result;
}

async function markDeliveriesFailed(db: AdminClient, ids: string[], message: string): Promise<void> {
  if (ids.length === 0) return;
  await db.from("newsletter_deliveries").update({ status: "FAILED", error_message: message }).in("id", ids);
}

export async function processCampaign(
  campaignId: string,
  opts: { trigger?: ProcessCampaignTrigger } = {},
): Promise<ProcessCampaignResult> {
  const trigger = opts.trigger ?? "schedule";
  const db = createAdminClient();
  const now = new Date();

  const { data: campaign } = await db
    .from("newsletter_campaigns")
    .select("id, newsletter_id, send_type, target_all, target_tags, range_end, audience")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };

  const { data: newsletter } = await db
    .from("newsletters")
    .select("id, slug, subject, blocks, published_at")
    .eq("id", campaign.newsletter_id)
    .maybeSingle();

  if (!newsletter) return { ok: false, error: "뉴스레터를 찾을 수 없습니다." };

  if (!newsletterConfig.resendApiKey || !newsletterConfig.senderEmail) {
    return { ok: false, error: "RESEND_API_KEY 또는 NEWSLETTER_SENDER_EMAIL이 설정되지 않았습니다." };
  }

  // NEWSLETTER_DELIVERY_MODE (default legacy) picks the send path; see
  // delivery-mode.ts. Promotional and tag-targeted campaigns always stay
  // on legacy.
  const delivery = selectCampaignDeliveryPath({
    mode: resolveDeliveryMode(),
    audience: campaign.audience,
    targetAll: campaign.target_all,
    targetTags: campaign.target_tags,
  });

  if (!(await claimCampaign(db, campaign, trigger, now))) {
    return { ok: false, skipped: true, error: "이미 발송 중이거나 발송 대기 상태가 아닌 캠페인입니다." };
  }

  try {
    if (delivery.path === "broadcast") {
      return await sendClaimedCampaignViaBroadcast(db, campaign, newsletter, now);
    }
    return await sendClaimedCampaign(db, campaign, newsletter, now);
  } catch (err) {
    // Anything thrown after the claim (DB errors loading recipients, creating
    // delivery rows, ...) must not leave the campaign stuck in SENDING.
    const message = err instanceof Error ? err.message : "발송 중 오류가 발생했습니다.";
    await db.from("newsletter_campaigns").update({ status: "FAILED", last_error: message }).eq("id", campaignId);
    return { ok: false, error: message };
  }
}

async function sendClaimedCampaign(
  db: AdminClient,
  campaign: {
    id: string;
    send_type: string;
    target_all: boolean;
    target_tags: string[] | null;
    range_end: string | null;
    audience: string;
  },
  newsletter: { id: string; slug: string; subject: string; blocks: unknown; published_at: string | null },
  now: Date,
): Promise<ProcessCampaignResult> {
  const campaignId = campaign.id;
  const isPromo = campaign.audience === "PROSPECTS";

  // Subscriber and Prospect are structurally compatible for send purposes —
  // both carry { id, email, unsubscribeToken }.
  const recipients: { id: string; email: string; unsubscribeToken: string }[] = isPromo
    ? await getTargetProspects()
    : await getTargetSubscribers({
        targetAll: campaign.target_all,
        targetTags: campaign.target_tags ?? [],
      });

  await db.from("newsletter_campaigns").update({ total_recipients: recipients.length }).eq("id", campaignId);

  if (recipients.length === 0) {
    await db
      .from("newsletter_campaigns")
      .update({
        status: campaignStatusAfterRun({
          sendType: campaign.send_type,
          rangeEnd: campaign.range_end,
          recipients: 0,
          sent: 0,
          now,
        }),
        sent_at: now.toISOString(),
        last_sent_date: kstDateString(now),
        total_sent: 0,
        total_failed: 0,
      })
      .eq("id", campaignId);

    return { ok: true, sent: 0, recipients: 0, failed: 0 };
  }

  // Assigned here (before the email is composed) rather than after sending,
  // so the issue number embedded in the email itself is correct on the very
  // first real send — see assignNewsletterIssueNumber for the "실제 발행" rule.
  // Promotional sends sit outside the numbered series entirely, so they never
  // get one.
  const issueNumber = isPromo ? null : await assignNewsletterIssueNumber(newsletter.id);

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
    isPromotional: isPromo,
  });

  const deliveryRows = recipients.map((r) => ({
    campaign_id: campaignId,
    subscriber_id: isPromo ? null : r.id,
    prospect_id: isPromo ? r.id : null,
    email: r.email,
    status: "QUEUED",
  }));

  const deliveries = await upsertDeliveries(
    db,
    deliveryRows,
    isPromo ? "campaign_id,prospect_id" : "campaign_id,subscriber_id",
  );

  const recipientById = new Map(recipients.map((r) => [r.id, r]));
  const resend = getResendClient();

  // Counts only emails Resend actually accepted — not batch sizes, which
  // would also count deliveries dropped from the payload.
  let totalSent = 0;
  let lastError: string | null = null;

  for (const batch of chunk(deliveries, SEND_BATCH_SIZE)) {
    const sendable: { deliveryId: string; payload: { from: string; to: string; subject: string; html: string } }[] =
      [];
    const unmatchedIds: string[] = [];

    for (const d of batch) {
      const recipient = recipientById.get((isPromo ? d.prospect_id : d.subscriber_id) ?? "");
      if (!recipient) {
        unmatchedIds.push(d.id);
        continue;
      }
      sendable.push({
        deliveryId: d.id,
        payload: {
          from: `${newsletterConfig.senderName} <${newsletterConfig.senderEmail}>`,
          to: recipient.email,
          subject: newsletter.subject,
          html: personalizeEmail(templateHtml, {
            trackingToken: d.tracking_token,
            unsubscribeToken: recipient.unsubscribeToken,
          }),
        },
      });
    }

    if (unmatchedIds.length > 0) {
      lastError = "수신자 정보를 찾을 수 없습니다.";
      await markDeliveriesFailed(db, unmatchedIds, lastError);
    }
    if (sendable.length === 0) continue;

    const ids = sendable.map((s) => s.deliveryId);

    try {
      const { error: sendError } = await resend.batch.send(sendable.map((s) => s.payload));

      if (sendError) {
        lastError = sendError.message;
        await markDeliveriesFailed(db, ids, sendError.message);
      } else {
        await db
          .from("newsletter_deliveries")
          .update({ status: "SENT", sent_at: new Date().toISOString(), error_message: null })
          .in("id", ids);
        totalSent += sendable.length;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "발송 중 오류가 발생했습니다.";
      await markDeliveriesFailed(db, ids, lastError);
    }
  }

  // Measured against recipients rather than returned delivery rows, so a
  // recipient that somehow got no delivery row still counts as failed.
  const totalFailed = recipients.length - totalSent;
  const status = campaignStatusAfterRun({
    sendType: campaign.send_type,
    rangeEnd: campaign.range_end,
    recipients: recipients.length,
    sent: totalSent,
    now,
  });

  await db
    .from("newsletter_campaigns")
    .update({
      status,
      sent_at: new Date().toISOString(),
      last_sent_date: kstDateString(now),
      total_sent: totalSent,
      total_failed: totalFailed,
      last_error: totalFailed > 0 ? lastError : null,
    })
    .eq("id", campaignId);

  // Promotional sends don't count as "this post appeared in the newsletter" —
  // that gate (board_posts.newsletter_published) is reserved for the real,
  // subscriber-facing newsletter. See lib/community-auth.ts::canViewColumnPost.
  if (totalSent > 0 && !isPromo) {
    await recordBoardPostNewsletterUsage(getSourcePostIds(blocks));
  }

  if (status === "FAILED") {
    return { ok: false, error: "이메일 발송에 모두 실패했습니다. Resend 발신 도메인 인증 상태를 확인해 주세요." };
  }

  return { ok: true, sent: totalSent, recipients: recipients.length, failed: totalFailed };
}

export async function getDueCampaigns(now: Date = new Date()): Promise<DueCampaign[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletter_campaigns")
    .select("id, send_type, scheduled_at, recurring_time, range_start, range_end, last_sent_date")
    .eq("status", "SCHEDULED");

  return (data ?? []).filter((c) => isCampaignDue(c, now));
}
