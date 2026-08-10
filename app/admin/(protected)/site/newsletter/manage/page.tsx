import Link from "next/link";
import { Save, Users, Image as ImageIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { ImageUpload } from "@/components/admin/newsletter/ImageUpload";
import { BlockEditor } from "@/components/admin/newsletter/BlockEditor";
import { CampaignSection } from "@/components/admin/newsletter/CampaignSection";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveNewsletterCampaign } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminNewsletterManageNewPage({ searchParams }: Props) {
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: banners } = await supabase
    .from("newsletter_ad_banners")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="뉴스레터 발송 관리"
        description="새 뉴스레터를 작성하고, 필요하면 바로 발송 일정을 함께 설정합니다."
        actions={
          <div className="flex items-center gap-2">
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

      <form action={saveNewsletterCampaign.bind(null, null)} className="space-y-6">
        <div className="rounded-xl border border-border bg-white p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input id="title" name="title" required placeholder="7월 둘째 주 뉴스레터" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="slug">URL 슬러그</Label>
              <Input id="slug" name="slug" placeholder="비워두면 제목으로 자동 생성" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <FormSelect id="status" name="status" defaultValue="DRAFT">
                <option value="DRAFT">임시저장</option>
                <option value="READY">발송대기</option>
                <option value="PUBLISHED">발행 (웹에 공개)</option>
                <option value="ARCHIVED">보관</option>
              </FormSelect>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">이메일 제목</Label>
            <Input id="subject" name="subject" placeholder="비워두면 뉴스레터 제목과 동일하게 사용" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="preheader">미리보기 텍스트</Label>
            <Textarea
              id="preheader"
              name="preheader"
              rows={2}
              placeholder="이메일 수신함에 표시되는 요약 문구"
            />
          </div>

          <div className="space-y-2">
            <Label>썸네일 이미지</Label>
            <ImageUpload name="thumbnail_url" />
            <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP · 최대 5MB</p>
          </div>
        </div>

        <div>
          <Label className="mb-3 block text-sm font-semibold text-foreground">콘텐츠 블록</Label>
          <BlockEditor name="blocks" defaultValue={[]} bannerOptions={banners ?? []} />
        </div>

        <CampaignSection />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          저장
        </button>
      </form>
    </div>
  );
}
