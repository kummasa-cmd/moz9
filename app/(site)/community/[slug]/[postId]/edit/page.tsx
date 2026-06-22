import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichEditor from "@/components/RichEditor";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const db = createAdminClient();

  const { data: board } = await db
    .from("boards")
    .select("id, name, use_category")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board) notFound();

  const { data: post } = await db
    .from("board_posts")
    .select("id, title, content, user_id, category_id")
    .eq("id", postId)
    .eq("board_id", board.id)
    .maybeSingle();

  if (!post) notFound();
  if (!canEdit(user, post.user_id)) redirect(`/community/${slug}/${postId}`);

  let categories: { id: string; name: string }[] = [];
  if (board.use_category) {
    const { data } = await db
      .from("board_categories")
      .select("id, name")
      .eq("board_id", board.id)
      .order("sort_order");
    categories = data ?? [];
  }

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
        {categories.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="category_id">
              카테고리 <span className="text-destructive">*</span>
            </Label>
            <select
              id="category_id"
              name="category_id"
              required
              defaultValue={post.category_id ?? ""}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">카테고리를 선택하세요</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="title">제목</Label>
          <Input id="title" name="title" required defaultValue={post.title} />
        </div>

        <div className="space-y-2">
          <Label>
            내용
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              이미지는 붙여넣기 또는 툴바 아이콘으로 삽입 (최대 5MB)
            </span>
          </Label>
          <RichEditor name="content" defaultValue={post.content} />
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
