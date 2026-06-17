import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/lib/community-auth";
import { updatePost } from "../../actions";

type Props = {
  params: Promise<{ slug: string; postId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function CommunityEditPostPage({ params, searchParams }: Props) {
  const { slug, postId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/${postId}/edit`);

  const { data: board } = await supabase
    .from("boards")
    .select("id, name")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board) notFound();

  const { data: post } = await supabase
    .from("board_posts")
    .select("id, title, content, user_id")
    .eq("id", postId)
    .eq("board_id", board.id)
    .maybeSingle();

  if (!post) notFound();
  if (!canEdit(user, post.user_id)) redirect(`/community/${slug}/${postId}`);

  const action = updatePost.bind(null, slug, postId);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href={`/community/${slug}/${postId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={14} />
        글로 돌아가기
      </Link>

      <h1 className="text-xl font-bold text-foreground mb-6">글 수정</h1>

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input id="title" name="title" required defaultValue={post.title} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">내용</Label>
          <Textarea
            id="content"
            name="content"
            rows={12}
            required
            defaultValue={post.content}
            className="resize-y"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Save size={14} />
            저장
          </button>
          <Link
            href={`/community/${slug}/${postId}`}
            className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}
