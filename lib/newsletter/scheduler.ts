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

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextCampaignStatus(sendType: string, rangeEnd: string | null): "SENT" | "SCHEDULED" {
  if (sendType === "RECURRING") return "SCHEDULED";
  if (sendType === "RANGE") {
    return rangeEnd && todayDateString() >= rangeEnd ? "SENT" : "SCHEDULED";
  }
  return "SENT";
}

export type ProcessCampaignResult =
  | { ok: true; sent: number; recipients: number }
  | { ok: false; error: string };

export async function processCampaign(campaignId: string): Promise<ProcessCampaignResult> {
  const db = createAdminClient();

  const { data: campaign } = await db
    .from("newsletter_campaigns")
    .select("id, newsletter_id, send_type, target_all, target_tags, range_end, audience")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };

  const isPromo = campaign.audience === "PROSPECTS";

  const { data: newsletter } = await db
    .from("newsletters")
    .select("id, slug, subject, blocks, published_at")
    .eq("id", campaign.newsletter_id)
    .maybeSingle();

  if (!newsletter) return { ok: false, error: "뉴스레터를 찾을 수 없습니다." };

  if (!newsletterConfig.resendApiKey || !newsletterConfig.senderEmail) {
    return { ok: false, error: "RESEND_API_KEY 또는 NEWSLETTER_SENDER_EMAIL이 설정되지 않았습니다." };
  }

  // Subscriber and Prospect are structurally compatible for send purposes —
  // both carry { id, email, unsubscribeToken }.
  const recipients: { id: string; email: string; unsubscribeToken: string }[] = isPromo
    ? await getTargetProspects()
    : await getTargetSubscribers({
        targetAll: campaign.target_all,
        targetTags: campaign.target_tags ?? [],
      });

  await db
    .from("newsletter_campaigns")
    .update({ status: "SENDING", total_recipients: recipients.length })
    .eq("id", campaignId);

  if (recipients.length === 0) {
    await db
      .from("newsletter_campaigns")
      .update({
        status: nextCampaignStatus(campaign.send_type, campaign.range_end),
        sent_at: new Date().toISOString(),
        last_sent_date: todayDateString(),
        total_sent: 0,
      })
      .eq("id", campaignId);

    return { ok: true, sent: 0, recipients: 0 };
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

  const { data: deliveries } = await db
    .from("newsletter_deliveries")
    .upsert(deliveryRows, { onConflict: isPromo ? "campaign_id,prospect_id" : "campaign_id,subscriber_id" })
    .select("id, subscriber_id, prospect_id, tracking_token");

  const recipientById = new Map(recipients.map((r) => [r.id, r]));
  const resend = getResendClient();

  let totalSent = 0;

  for (const batch of chunk(deliveries ?? [], 100)) {
    const payload = batch
      .map((d) => {
        const recipient = recipientById.get(isPromo ? d.prospect_id : d.subscriber_id);
        if (!recipient) return null;
        const html = personalizeEmail(templateHtml, {
          trackingToken: d.tracking_token,
          unsubscribeToken: recipient.unsubscribeToken,
        });
        return {
          from: `${newsletterConfig.senderName} <${newsletterConfig.senderEmail}>`,
          to: recipient.email,
          subject: newsletter.subject,
          html,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const ids = batch.map((d) => d.id);

    try {
      const { error: sendError } = await resend.batch.send(payload);

      if (sendError) {
        await db
          .from("newsletter_deliveries")
          .update({ status: "FAILED", error_message: sendError.message })
          .in("id", ids);
      } else {
        await db
          .from("newsletter_deliveries")
          .update({ status: "SENT", sent_at: new Date().toISOString() })
          .in("id", ids);
        totalSent += batch.length;
      }
    } catch (err) {
      await db
        .from("newsletter_deliveries")
        .update({
          status: "FAILED",
          error_message: err instanceof Error ? err.message : "발송 중 오류가 발생했습니다.",
        })
        .in("id", ids);
    }
  }

  const allFailed = totalSent === 0 && recipients.length > 0;

  await db
    .from("newsletter_campaigns")
    .update({
      status: allFailed ? "FAILED" : nextCampaignStatus(campaign.send_type, campaign.range_end),
      sent_at: new Date().toISOString(),
      last_sent_date: todayDateString(),
      total_sent: totalSent,
    })
    .eq("id", campaignId);

  // Promotional sends don't count as "this post appeared in the newsletter" —
  // that gate (board_posts.newsletter_published) is reserved for the real,
  // subscriber-facing newsletter. See lib/community-auth.ts::canViewColumnPost.
  if (totalSent > 0 && !isPromo) {
    await recordBoardPostNewsletterUsage(getSourcePostIds(blocks));
  }

  if (allFailed) {
    return { ok: false, error: "이메일 발송에 모두 실패했습니다. Resend 발신 도메인 인증 상태를 확인해 주세요." };
  }

  return { ok: true, sent: totalSent, recipients: recipients.length };
}

export type DueCampaign = {
  id: string;
  send_type: string;
  scheduled_at: string | null;
  range_start: string | null;
  range_end: string | null;
  last_sent_date: string | null;
};

export function isCampaignDue(campaign: DueCampaign, now: Date): boolean {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);

  if (campaign.send_type === "SCHEDULED") {
    return campaign.scheduled_at !== null && campaign.scheduled_at <= nowIso;
  }
  if (campaign.send_type === "RECURRING") {
    return campaign.last_sent_date !== today;
  }
  if (campaign.send_type === "RANGE") {
    return (
      (campaign.range_start ?? "") <= today &&
      today <= (campaign.range_end ?? "") &&
      campaign.last_sent_date !== today
    );
  }
  // IMMEDIATE campaigns are normally sent right after creation, but this is a
  // safety net in case one was left in SCHEDULED status without being sent.
  return campaign.send_type === "IMMEDIATE";
}

export async function getDueCampaigns(now: Date = new Date()): Promise<DueCampaign[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("newsletter_campaigns")
    .select("id, send_type, scheduled_at, range_start, range_end, last_sent_date")
    .eq("status", "SCHEDULED");

  return (data ?? []).filter((c) => isCampaignDue(c, now));
}
