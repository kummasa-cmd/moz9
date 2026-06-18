import { CheckCircle, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSiteSettings } from "./actions";

type SiteMainPageProps = {
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export default async function AdminSiteMainPage({ searchParams }: SiteMainPageProps) {
  const { saved, error } = await searchParams;
  const supabase = createAdminClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    <div className="max-w-2xl">
      <PageHeader title="메인관리" description="홈페이지 히어로 영역과 회사 정보를 관리합니다." />

      <form action={updateSiteSettings} className="space-y-6">
        <div className="rounded-xl border border-border bg-white p-6 space-y-5">
          <h3 className="font-semibold text-foreground">히어로 섹션</h3>

          <div className="space-y-2">
            <Label htmlFor="heroTitle">제목</Label>
            <Input id="heroTitle" name="heroTitle" defaultValue={settings?.hero_title ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">부제목</Label>
            <Textarea
              id="heroSubtitle"
              name="heroSubtitle"
              rows={2}
              defaultValue={settings?.hero_subtitle ?? ""}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ctaLabel">CTA 버튼 텍스트</Label>
              <Input id="ctaLabel" name="ctaLabel" defaultValue={settings?.cta_label ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ctaHref">CTA 버튼 링크</Label>
              <Input id="ctaHref" name="ctaHref" defaultValue={settings?.cta_href ?? ""} />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-white p-6 space-y-5">
          <h3 className="font-semibold text-foreground">회사 정보 (푸터 표시)</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="companyName">상호명</Label>
              <Input id="companyName" name="companyName" defaultValue={settings?.company_name ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bizNumber">사업자번호</Label>
              <Input id="bizNumber" name="bizNumber" defaultValue={settings?.biz_number ?? ""} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">주소</Label>
            <Input id="address" name="address" defaultValue={settings?.address ?? ""} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label htmlFor="ceo">대표자</Label>
              <Input id="ceo" name="ceo" defaultValue={settings?.ceo ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">연락처</Label>
              <Input id="phone" name="phone" defaultValue={settings?.phone ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일</Label>
              <Input id="email" name="email" type="email" defaultValue={settings?.email ?? ""} />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          저장하기
        </button>

        {saved && (
          <p className="inline-flex items-center gap-1.5 text-sm text-primary ml-3">
            <CheckCircle size={15} /> 저장되었습니다
          </p>
        )}
      </form>
    </div>
  );
}
