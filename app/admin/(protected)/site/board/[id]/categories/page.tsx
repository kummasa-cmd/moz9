import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Save, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { createCategory, deleteCategory } from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminBoardCategoriesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: board }, { data: categories }] = await Promise.all([
    supabase.from("boards").select("id, name").eq("id", id).maybeSingle(),
    supabase
      .from("board_categories")
      .select("id, name, sort_order, created_at")
      .eq("board_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!board) notFound();

  return (
    <div>
      <div className="mb-1">
        <Link
          href={`/admin/site/board/${id}/posts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {board.name} 게시물 목록으로
        </Link>
      </div>

      <PageHeader
        title={`${board.name} — 카테고리 관리`}
        description={`총 ${categories?.length ?? 0}개의 카테고리가 등록되어 있습니다.`}
      />

      <details className="rounded-xl border border-border bg-white mb-6 max-w-lg group">
        <summary className="cursor-pointer list-none px-6 py-4 font-medium text-sm text-foreground flex items-center justify-between">
          카테고리 추가
          <span className="text-muted-foreground text-xs group-open:hidden">열기</span>
          <span className="text-muted-foreground text-xs hidden group-open:inline">닫기</span>
        </summary>

        <form
          action={createCategory.bind(null, board.id)}
          className="px-6 pb-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="name">
                카테고리명 <span className="text-destructive">*</span>
              </Label>
              <Input id="name" name="name" required placeholder="예: 공지, 후기, 질문" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">정렬 순서</Label>
              <Input id="sort_order" name="sort_order" type="number" min={0} defaultValue={0} />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Save size={14} />
            카테고리 추가
          </button>
        </form>
      </details>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 text-center">순서</TableHead>
              <TableHead>카테고리명</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(categories ?? []).map((c) => (
              <TableRow key={c.id}>
                <TableCell className="text-center text-muted-foreground">{c.sort_order}</TableCell>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/site/board/${id}/categories/${c.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteCategory}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="board_id" value={id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {categories && categories.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground py-10">
                  등록된 카테고리가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
