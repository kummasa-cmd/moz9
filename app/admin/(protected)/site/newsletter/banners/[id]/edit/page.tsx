import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { ImageUpload } from "@/components/admin/newsletter/ImageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateBanner } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminNewsletterBannerEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: banner } = await supabase
    .from("newsletter_ad_banners")
    .select("id, name, image_url, link_url, position, start_date, end_date, is_active")
    .eq("id", id)
    .maybeSingle();

  if (!banner) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title="배너 수정" description={`"${banner.name}" 배너를 수정합니다.`} />

      <form
        action={updateBanner.bind(null, banner.id)}
        className="rounded-xl border border-border bg-white p-6 space-y-6"
      >
        <div className="space-y-2">
          <Label htmlFor="name">
            배너 이름 <span className="text-destructive">*</span>
          </Label>
          <Input id="name" name="name" required defaultValue={banner.name} />
        </div>

        <div className="space-y-2">
          <Label>배너 이미지</Label>
          <ImageUpload name="image_url" defaultValue={banner.image_url} />
          <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP · 최대 5MB</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link_url">
            연결 링크 <span className="text-destructive">*</span>
          </Label>
          <Input id="link_url" name="link_url" type="url" required defaultValue={banner.link_url} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="position">노출 위치</Label>
            <FormSelect id="position" name="position" defaultValue={banner.position}>
              <option value="TOP">상단</option>
              <option value="MIDDLE">중단</option>
              <option value="BOTTOM">하단</option>
              <option value="SIDEBAR">사이드바</option>
            </FormSelect>
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">시작일</Label>
            <Input id="start_date" name="start_date" type="date" required defaultValue={banner.start_date} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end_date">종료일</Label>
            <Input id="end_date" name="end_date" type="date" required defaultValue={banner.end_date} />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={banner.is_active}
            className="size-4 rounded border-input"
          />
          활성화
        </label>

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
