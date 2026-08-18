import { createAdminClient } from "@/lib/supabase/admin";
import { getAdBannerIds, getSourcePostIds, type ContentBlock } from "./blocks/types";
import { renderBlocksToHtml } from "./blocks/email-renderer";
import { getAdBannersByIds, getTargetSubscribers, recordBoardPostNewsletterUsage } from "./queries";
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
    .select("id, newsletter_id, send_type, target_all, target_tags, range_end")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "캠페인을 찾을 수 없습니다." };

  const { data: newsletter } = await db
    .from("newsletters")
    .select("id, slug, subject, blocks")
    .eq("id", campaign.newsletter_id)
    .maybeSingle();

  if (!newsletter) return { ok: false, error: "뉴스레터를 찾을 수 없습니다." };

  if (!newsletterConfig.resendApiKey || !newsletterConfig.senderEmail) {
    return { ok: false, error: "RESEND_API_KEY 또는 NEWSLETTER_SENDER_EMAIL이 설정되지 않았습니다." };
  }

  const subscribers = await getTargetSubscribers({
    targetAll: campaign.target_all,
    targetTags: campaign.target_tags ?? [],
  });

  await db
    .from("newsletter_campaigns")
    .update({ status: "SENDING", total_recipients: subscribers.length })
    .eq("id", campaignId);

  if (subscribers.length === 0) {
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

  const blocks = (newsletter.blocks as ContentBlock[] | null) ?? [];
  const banners = await getAdBannersByIds(getAdBannerIds(blocks));
  const bodyHtml = renderBlocksToHtml(blocks, { brandColor: newsletterConfig.brandColor, banners });
  const templateHtml = buildEmailTemplate(bodyHtml, {
    newsletterId: newsletter.id,
    slug: newsletter.slug,
  });

  const deliveryRows = subscribers.map((s) => ({
    campaign_id: campaignId,
    subscriber_id: s.id,
    email: s.email,
    status: "QUEUED",
  }));

  const { data: deliveries } = await db
    .from("newsletter_deliveries")
    .upsert(deliveryRows, { onConflict: "campaign_id,subscriber_id" })
    .select("id, subscriber_id, tracking_token");

  const subscriberById = new Map(subscribers.map((s) => [s.id, s]));
  const resend = getResendClient();

  let totalSent = 0;

  for (const batch of chunk(deliveries ?? [], 100)) {
    const payload = batch
      .map((d) => {
        const subscriber = subscriberById.get(d.subscriber_id);
        if (!subscriber) return null;
        const html = personalizeEmail(templateHtml, {
          trackingToken: d.tracking_token,
          unsubscribeToken: subscriber.unsubscribeToken,
        });
        return {
          from: `${newsletterConfig.senderName} <${newsletterConfig.senderEmail}>`,
          to: subscriber.email,
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

  const allFailed = totalSent === 0 && subscribers.length > 0;

  await db
    .from("newsletter_campaigns")
    .update({
      status: allFailed ? "FAILED" : nextCampaignStatus(campaign.send_type, campaign.range_end),
      sent_at: new Date().toISOString(),
      last_sent_date: todayDateString(),
      total_sent: totalSent,
    })
    .eq("id", campaignId);

  if (totalSent > 0) {
    await recordBoardPostNewsletterUsage(getSourcePostIds(blocks));
  }

  if (allFailed) {
    return { ok: false, error: "이메일 발송에 모두 실패했습니다. Resend 발신 도메인 인증 상태를 확인해 주세요." };
  }

  return { ok: true, sent: totalSent, recipients: subscribers.length };
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
