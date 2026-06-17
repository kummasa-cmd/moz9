import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import BoardPostEntryForm from "@/components/admin/BoardPostEntryForm";
import { createClient } from "@/lib/supabase/server";
import { createBoardPost } from "../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminBoardPostNewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: board } = await supabase
    .from("boards")
    .select("id, name, use_category")
    .eq("id", id)
    .maybeSingle();

  if (!board) notFound();

  let categories: { id: string; name: string }[] = [];
  if (board.use_category) {
    const { data } = await supabase
      .from("board_categories")
      .select("id, name")
      .eq("board_id", id)
      .order("sort_order");
    categories = data ?? [];
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-1">
        <Link
          href={`/admin/site/board/${id}/posts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {board.name} 목록으로
        </Link>
      </div>
      <PageHeader title="글쓰기" description={`${board.name} 게시판에 새 게시물을 작성합니다.`} />
      <BoardPostEntryForm
        action={createBoardPost.bind(null, board.id)}
        categories={categories}
        error={error}
        submitLabel="게시물 등록"
      />
    </div>
  );
}
