import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import { createPortfolioItem } from "../actions";

type NewPortfolioPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminPortfolioNewPage({ searchParams }: NewPortfolioPageProps) {
  const { error } = await searchParams;

  return (
    <div className="max-w-2xl">
      <PageHeader title="포트폴리오 등록" description="제작 사례 정보를 입력해 주세요." />

      <form action={createPortfolioItem} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="title">
            제목 <span className="text-destructive">*</span>
          </Label>
          <Input id="title" name="title" required placeholder="작가 개인 브랜딩 사이트" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="category">카테고리</Label>
            <FormSelect id="category" name="category" defaultValue="홈페이지 제작">
              <option value="홈페이지 제작">홈페이지 제작</option>
              <option value="랜딩 페이지">랜딩 페이지</option>
              <option value="포트폴리오">포트폴리오</option>
              <option value="콘텐츠 제작">콘텐츠 제작</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">공개 상태</Label>
            <FormSelect id="status" name="status" defaultValue="공개">
              <option value="공개">공개</option>
              <option value="비공개">비공개</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="link">사이트 링크</Label>
          <Input id="link" name="link" type="url" placeholder="https://example.com" />
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
            placeholder="프로젝트 소개 내용을 입력해 주세요"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          포트폴리오 등록
        </button>
      </form>
    </div>
  );
}
