import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import BoardPostEntryForm from "@/components/admin/BoardPostEntryForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateBoardPost } from "../../actions";

type Props = {
  params: Promise<{ id: string; postId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminBoardPostEditPage({ params, searchParams }: Props) {
  const { id, postId } = await params;
  const { error } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: board }, { data: post }] = await Promise.all([
    supabase.from("boards").select("id, name, use_category").eq("id", id).maybeSingle(),
    supabase
      .from("board_posts")
      .select("id, title, content, status, category_id")
      .eq("id", postId)
      .eq("board_id", id)
      .maybeSingle(),
  ]);

  if (!board || !post) notFound();

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
      <PageHeader title="게시물 수정" description={`"${post.title}"을 수정합니다.`} />
      <BoardPostEntryForm
        action={updateBoardPost.bind(null, board.id, post.id)}
        defaultValues={post}
        categories={categories}
        error={error}
        submitLabel="수정 완료"
      />
    </div>
  );
}
