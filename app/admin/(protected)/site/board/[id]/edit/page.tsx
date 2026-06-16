import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import BoardPostForm from "@/components/admin/BoardPostForm";
import { createClient } from "@/lib/supabase/server";
import { updatePost } from "../../actions";

type EditPostPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminSiteBoardEditPage({ params, searchParams }: EditPostPageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: post } = await supabase
    .from("board_posts")
    .select("id, board, title, content, status")
    .eq("id", id)
    .maybeSingle();

  if (!post) notFound();

  return (
    <div>
      <PageHeader title="게시물 수정" description={`"${post.title}" 게시물을 수정합니다.`} />
      <BoardPostForm
        action={updatePost.bind(null, post.id)}
        defaultValues={post}
        error={error}
        submitLabel="수정 완료"
      />
    </div>
  );
}
