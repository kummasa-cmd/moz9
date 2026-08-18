"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaign } from "@/lib/newsletter/scheduler";
import { recordBoardPostNewsletterUsage } from "@/lib/newsletter/queries";
import { getSourcePostIds, type ContentBlock } from "@/lib/newsletter/blocks/types";
import { kstDatetimeLocalToUtcIso } from "@/lib/newsletter/schedule-time";

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

    const campaignFields = {
      newsletter_id: newsletterId,
      name: campaign_name,
      send_type,
      scheduled_at,
      recurring_time,
      range_start,
      range_end,
      target_all,
      target_tags,
    };

    let campaignId = existingCampaignId;

    if (existingCampaignId) {
      const { error } = await supabase
        .from("newsletter_campaigns")
        .update({ ...campaignFields, status: "SCHEDULED" })
        .eq("id", existingCampaignId);

      if (error) redirect(`${afterSaveEditUrl}?error=${encodeURIComponent(error.message)}`);
    } else {
      const { data: insertedCampaign, error } = await supabase
        .from("newsletter_campaigns")
        .insert({ ...campaignFields, status: "SCHEDULED" })
        .select("id")
        .single();

      if (error) redirect(`${afterSaveEditUrl}?error=${encodeURIComponent(error.message)}`);
      campaignId = insertedCampaign?.id ?? null;
    }

    if (send_type === "IMMEDIATE" && campaignId) {
      const result = await processCampaign(campaignId);
      if (!result.ok) {
        redirect(`${afterSaveEditUrl}?error=${encodeURIComponent(`발송 실패: ${result.error}`)}`);
      }
    }
  }

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/newsletter");
  revalidatePath(`/newsletter/${encodeURIComponent(slug)}`);
  redirect("/admin/site/newsletter/list");
}
