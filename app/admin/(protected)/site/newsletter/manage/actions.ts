"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaign } from "@/lib/newsletter/scheduler";
import { assignNewsletterIssueNumber, recordBoardPostNewsletterUsage } from "@/lib/newsletter/queries";
import { getSourcePostIds, type ContentBlock } from "@/lib/newsletter/blocks/types";
import { kstDatetimeLocalToUtcIso } from "@/lib/newsletter/schedule-time";
import {
  createCampaignSaveStore,
  saveCampaignSchedule,
  type CampaignSaveResult,
} from "@/lib/newsletter/campaign-save";

function parseBlocks(raw: FormDataEntryValue | null): ContentBlock[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as ContentBlock[]) : [];
  } catch {
    return [];
  }
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function saveNewsletterCampaign(id: string | null, formData: FormData) {
  const title = String(formData.get("title") ?? "");
  const subject = String(formData.get("subject") ?? "") || title;
  const preheader = String(formData.get("preheader") ?? "") || null;
  const thumbnail_url = String(formData.get("thumbnail_url") ?? "") || null;
  const status = String(formData.get("status") ?? "DRAFT");
  const blocks = parseBlocks(formData.get("blocks"));
  let slug = slugify(String(formData.get("slug") ?? "") || title);

  const editBase = id ? `/admin/site/newsletter/manage/${id}` : "/admin/site/newsletter/manage";

  if (!slug) {
    redirect(`${editBase}?error=${encodeURIComponent("제목 또는 슬러그를 입력해 주세요.")}`);
  }

  const supabase = createAdminClient();

  let slugQuery = supabase.from("newsletters").select("id").eq("slug", slug);
  if (id) slugQuery = slugQuery.neq("id", id);
  const { data: slugOwner } = await slugQuery.maybeSingle();
  if (slugOwner) slug = `${slug}-${Date.now().toString(36)}`;

  let newsletterId = id;
  let isFirstPublish = false;

  if (id) {
    const { data: current } = await supabase
      .from("newsletters")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();

    isFirstPublish = status === "PUBLISHED" && !current?.published_at;
    const published_at = isFirstPublish ? new Date().toISOString() : (current?.published_at ?? null);

    const { error } = await supabase
      .from("newsletters")
      .update({ title, slug, subject, preheader, thumbnail_url, status, blocks, published_at })
      .eq("id", id);

    if (error) {
      redirect(`${editBase}?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    isFirstPublish = status === "PUBLISHED";
    const published_at = isFirstPublish ? new Date().toISOString() : null;

    const { data: inserted, error } = await supabase
      .from("newsletters")
      .insert({ title, slug, subject, preheader, thumbnail_url, status, blocks, published_at })
      .select("id")
      .single();

    if (error || !inserted) {
      redirect(`${editBase}?error=${encodeURIComponent(error?.message ?? "저장에 실패했습니다.")}`);
    }

    newsletterId = inserted!.id;
  }

  if (isFirstPublish) {
    await recordBoardPostNewsletterUsage(getSourcePostIds(blocks));
  }

  const afterSaveEditUrl = `/admin/site/newsletter/manage/${newsletterId}`;
  const enableCampaign = formData.get("enable_campaign") === "on";

  // Pure web publish (no email campaign) is visible immediately, so it counts
  // as a real publish right away. When a campaign is attached, the issue
  // number is assigned later at the actual send (processCampaign in
  // scheduler.ts) — a PUBLISHED newsletter waiting on an unsent SCHEDULED
  // campaign ("임시 대기") must not be counted yet.
  if (isFirstPublish && !enableCampaign) {
    await assignNewsletterIssueNumber(newsletterId!);
  }

  if (enableCampaign) {
    const send_type = String(formData.get("send_type") ?? "SCHEDULED");
    const scheduledAtLocal = String(formData.get("scheduled_at") ?? "") || null;
    const scheduled_at = scheduledAtLocal ? kstDatetimeLocalToUtcIso(scheduledAtLocal) : null;
    const recurring_time = String(formData.get("recurring_time") ?? "") || null;
    const range_start = String(formData.get("range_start") ?? "") || null;
    const range_end = String(formData.get("range_end") ?? "") || null;
    const target_all = formData.get("target_all") === "on";
    const target_tags = String(formData.get("target_tags") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const campaign_name = String(formData.get("campaign_name") ?? "") || title;
    const existingCampaignId = String(formData.get("campaign_id") ?? "") || null;

    if (send_type === "SCHEDULED" && !scheduled_at) {
      redirect(`${afterSaveEditUrl}?error=${encodeURIComponent("발송 일시를 선택해 주세요.")}`);
    }
    if (send_type === "RECURRING" && !recurring_time) {
      redirect(`${afterSaveEditUrl}?error=${encodeURIComponent("매일 발송할 시각을 선택해 주세요.")}`);
    }
    if (send_type === "RANGE" && (!range_start || !range_end)) {
      redirect(`${afterSaveEditUrl}?error=${encodeURIComponent("발송 기간을 선택해 주세요.")}`);
    }

    // Server-side guard against resending: a SENT / PARTIAL / SENDING campaign
    // (or a one-shot one that already reached someone) keeps its send
    // settings no matter what the form submitted — see campaign-save.ts. The
    // newsletter content above is still saved.
    let saveResult: CampaignSaveResult;
    try {
      saveResult = await saveCampaignSchedule(createCampaignSaveStore(supabase), {
        existingCampaignId,
        fields: {
          newsletter_id: newsletterId!,
          name: campaign_name,
          send_type,
          scheduled_at,
          recurring_time,
          range_start,
          range_end,
          target_all,
          target_tags,
        },
      }, (campaignId) => processCampaign(campaignId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "캠페인 저장에 실패했습니다.";
      redirect(`${afterSaveEditUrl}?error=${encodeURIComponent(message)}`);
    }

    if (saveResult.kind === "locked") {
      console.warn("[newsletter] campaign send settings left unchanged:", saveResult.campaignId, saveResult.reason);
    } else if (saveResult.kind === "conflict") {
      redirect(
        `${afterSaveEditUrl}?error=${encodeURIComponent("캠페인 상태가 바뀌어 발송 설정을 저장하지 않았습니다. 다시 확인해 주세요.")}`,
      );
    } else if (saveResult.sendResult && !saveResult.sendResult.ok) {
      redirect(`${afterSaveEditUrl}?error=${encodeURIComponent(`발송 실패: ${saveResult.sendResult.error}`)}`);
    }
  }

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/newsletter");
  revalidatePath(`/newsletter/${encodeURIComponent(slug)}`);
  redirect("/admin/site/newsletter/list");
}
