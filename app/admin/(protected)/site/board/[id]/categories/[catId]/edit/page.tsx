import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateCategory } from "../../actions";

type Props = {
  params: Promise<{ id: string; catId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminCategoryEditPage({ params, searchParams }: Props) {
  const { id, catId } = await params;
  const { error } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: board }, { data: category }] = await Promise.all([
    supabase.from("boards").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("board_categories")
      .select("id, name, sort_order")
      .eq("id", catId)
      .eq("board_id", id)
      .maybeSingle(),
  ]);

  if (!board || !category) notFound();

  return (
    <div className="max-w-lg">
      <div className="mb-1">
        <Link
          href={`/admin/site/board/${id}/categories`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {board.name} 카테고리 목록으로
        </Link>
      </div>

      <PageHeader title="카테고리 수정" description={`"${category.name}" 카테고리를 수정합니다.`} />

      <form
        action={updateCategory.bind(null, board.id, category.id)}
        className="rounded-xl border border-border bg-white p-6 space-y-6"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="name">
              카테고리명 <span className="text-destructive">*</span>
            </Label>
            <Input id="name" name="name" required defaultValue={category.name} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort_order">정렬 순서</Label>
            <Input
              id="sort_order"
              name="sort_order"
              type="number"
              min={0}
              defaultValue={category.sort_order}
            />
          </div>
        </div>

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
