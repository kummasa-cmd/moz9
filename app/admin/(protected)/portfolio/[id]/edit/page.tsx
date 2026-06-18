import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import PortfolioImageUpload from "@/components/admin/PortfolioImageUpload";
import { createAdminClient } from "@/lib/supabase/admin";
import { updatePortfolioItem } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminPortfolioEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: item } = await supabase
    .from("portfolio_items")
    .select("id, title, category, status, link, description, thumbnail_url")
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const action = updatePortfolioItem.bind(null, id);

  return (
    <div className="max-w-2xl">
      <PageHeader title="포트폴리오 수정" description="포트폴리오 정보를 수정해 주세요." />

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="title" name="title" required defaultValue={item.title} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="category">카테고리</Label>
            <FormSelect id="category" name="category" defaultValue={item.category}>
              <option value="홈페이지 제작">홈페이지 제작</option>
              <option value="랜딩 페이지">랜딩 페이지</option>
              <option value="포트폴리오">포트폴리오</option>
              <option value="콘텐츠 제작">콘텐츠 제작</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">공개 상태</Label>
            <FormSelect id="status" name="status" defaultValue={item.status}>
              <option value="공개">공개</option>
              <option value="비공개">비공개</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link">사이트 링크</Label>
          <Input id="link" name="link" type="url" defaultValue={item.link ?? ""} placeholder="https://example.com" />
        </div>

        <div className="space-y-2">
          <Label>썸네일 이미지</Label>
          <PortfolioImageUpload name="thumbnail_url" defaultValue={item.thumbnail_url} />
          <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP · 최대 5MB</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">
            설명 <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="description"
            name="description"
            rows={5}
            required
            defaultValue={item.description}
          />
        </div>

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
