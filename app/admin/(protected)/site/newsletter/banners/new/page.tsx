import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { ImageUpload } from "@/components/admin/newsletter/ImageUpload";
import { createBanner } from "../actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminNewsletterBannerNewPage({ searchParams }: Props) {
  const { error } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="max-w-2xl">
      <PageHeader title="배너 등록" description="이메일과 뉴스레터 상세페이지에 노출할 배너를 등록합니다." />

      <form action={createBanner} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">
            배너 이름 <span className="text-destructive">*</span>
          </Label>
          <Input id="name" name="name" required placeholder="7월 프로모션 배너" />
        </div>

        <div className="space-y-2">
          <Label>배너 이미지</Label>
          <ImageUpload name="image_url" />
          <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP · 최대 5MB</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link_url">
            연결 링크 <span className="text-destructive">*</span>
          </Label>
          <Input id="link_url" name="link_url" type="url" required placeholder="https://example.com" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="position">노출 위치</Label>
            <FormSelect id="position" name="position" defaultValue="MIDDLE">
              <option value="TOP">상단</option>
              <option value="MIDDLE">중단</option>
              <option value="BOTTOM">하단</option>
              <option value="SIDEBAR">사이드바</option>
            </FormSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">시작일</Label>
            <Input id="start_date" name="start_date" type="date" required defaultValue={today} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">종료일</Label>
            <Input id="end_date" name="end_date" type="date" required defaultValue={today} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" name="is_active" defaultChecked className="size-4 rounded border-input" />
          바로 활성화
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          배너 등록
        </button>
      </form>
    </div>
  );
}
