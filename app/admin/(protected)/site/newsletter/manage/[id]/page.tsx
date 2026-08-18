import { notFound } from "next/navigation";
import Link from "next/link";
import { Save, Users, Image as ImageIcon, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { ImageUpload } from "@/components/admin/newsletter/ImageUpload";
import { BlockEditor } from "@/components/admin/newsletter/BlockEditor";
import { CampaignSection } from "@/components/admin/newsletter/CampaignSection";
import { createAdminClient } from "@/lib/supabase/admin";
import { getColumnBoardPosts } from "@/lib/newsletter/queries";
import { saveNewsletterCampaign } from "../actions";
import type { ContentBlock } from "@/lib/newsletter/blocks/types";
import { utcIsoToKstDatetimeLocal } from "@/lib/newsletter/schedule-time";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminNewsletterManageEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const [{ data: newsletter }, { data: banners }, { data: campaign }, boardPosts] = await Promise.all([
    supabase
      .from("newsletters")
      .select("id, title, slug, subject, preheader, thumbnail_url, status, blocks")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("newsletter_ad_banners")
      .select("id, name")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("newsletter_campaigns")
      .select(
        "id, name, send_type, status, scheduled_at, recurring_time, range_start, range_end, target_all, target_tags",
      )
      .eq("newsletter_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getColumnBoardPosts(),
  ]);

  if (!newsletter) notFound();

  const blocks = (newsletter.blocks as ContentBlock[] | null) ?? [];
  const campaignActive = campaign && campaign.status !== "CANCELLED";

  return (
    <div>
      <PageHeader
        title="뉴스레터 발송 관리"
        description={`"${newsletter.title}" 뉴스레터를 수정합니다.`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/site/newsletter/list/${newsletter.id}/preview`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Eye size={14} />
              미리보기
            </Link>
            <Link
              href="/admin/site/newsletter/subscribers"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Users size={14} />
              구독자관리
            </Link>
            <Link
              href="/admin/site/newsletter/banners"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <ImageIcon size={14} />
              광고배너
            </Link>
          </div>
        }
      />

      <form
        action={saveNewsletterCampaign.bind(null, newsletter.id)}
        className="space-y-6"
      >
        <div className="rounded-xl border border-border bg-white p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input id="title" name="title" required defaultValue={newsletter.title} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="slug">URL 슬러그</Label>
              <Input id="slug" name="slug" defaultValue={newsletter.slug} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <FormSelect id="status" name="status" defaultValue={newsletter.status}>
                <option value="DRAFT">임시저장</option>
                <option value="READY">발송대기</option>
                <option value="PUBLISHED">발행 (웹에 공개)</option>
                <option value="ARCHIVED">보관</option>
              </FormSelect>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">이메일 제목</Label>
            <Input id="subject" name="subject" defaultValue={newsletter.subject} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preheader">미리보기 텍스트</Label>
            <Textarea id="preheader" name="preheader" rows={2} defaultValue={newsletter.preheader ?? ""} />
          </div>

          <div className="space-y-2">
            <Label>썸네일 이미지</Label>
            <ImageUpload name="thumbnail_url" defaultValue={newsletter.thumbnail_url} />
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP · 최대 5MB</p>
          </div>
        </div>

        <div>
          <Label className="mb-3 block text-sm font-semibold text-foreground">콘텐츠 블록</Label>
          <BlockEditor
            name="blocks"
            defaultValue={blocks}
            bannerOptions={banners ?? []}
            boardPosts={boardPosts}
          />
        </div>

        <CampaignSection
          campaignId={campaign?.id}
          defaultEnabled={!!campaignActive}
          defaultCampaignName={campaign?.name ?? ""}
          defaultSendType={campaign?.send_type ?? "SCHEDULED"}
          defaultScheduledAt={utcIsoToKstDatetimeLocal(campaign?.scheduled_at ?? null)}
          defaultRecurringTime={campaign?.recurring_time ?? "09:00"}
          defaultRangeStart={campaign?.range_start ?? ""}
          defaultRangeEnd={campaign?.range_end ?? ""}
          defaultTargetAll={campaign?.target_all ?? true}
          defaultTargetTags={(campaign?.target_tags ?? []).join(", ")}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          수정 완료
        </button>
      </form>
    </div>
  );
}
