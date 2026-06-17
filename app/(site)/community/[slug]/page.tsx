import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Lock, ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { isAdmin, canEdit } from "@/lib/community-auth";
import { deletePost } from "./actions";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function CommunityBoardPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = isAdmin(user);

  const { data: board } = await supabase
    .from("boards")
    .select("id, name, slug, type, allow_user_write, use_category")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board) notFound();

  const isPrivate = board.type === "개인";

  let query = supabase
    .from("board_posts")
    .select("id, title, author, created_at, is_notice, view_count, status, user_id")
    .eq("board_id", board.id)
    .eq("status", "게시중")
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false });

  if (isPrivate && !admin) {
    if (user) {
      // Logged-in non-admin: own posts + notice posts
      query = query.or(`user_id.eq.${user.id},is_notice.eq.true`);
    } else {
      // Not logged in: notice posts only
      query = query.eq("is_notice", true);
    }
  }

  const { data: posts } = await query;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back + Header */}
      <div className="mb-6">
        <Link
          href="/community"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft size={14} />
          커뮤니티
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPrivate && <Lock size={16} className="text-muted-foreground" />}
            <h1 className="text-2xl font-bold text-foreground">{board.name}</h1>
          </div>
          {board.allow_user_write && user && (
            <Link
              href={`/community/${slug}/new`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Pencil size={14} />
              글쓰기
            </Link>
          )}
        </div>
        {isPrivate && !admin && user && (
          <p className="text-xs text-muted-foreground mt-1">공지 및 내가 작성한 글만 표시됩니다.</p>
        )}
        {isPrivate && !user && (
          <p className="text-xs text-muted-foreground mt-1">
            공지글만 표시됩니다.{" "}
            <Link href={`/login?next=/community/${slug}`} className="text-primary hover:underline">
              로그인
            </Link>
            하면 더 많은 글을 볼 수 있습니다.
          </p>
        )}
      </div>

      {/* Post list */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {posts && posts.length > 0 ? (
          <ul className="divide-y divide-border">
            {posts.map((post) => {
              const editable = canEdit(user, post.user_id);
              return (
                <li
                  key={post.id}
                  className={`flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors ${post.is_notice ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {post.is_notice && (
                      <span className="flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary text-white">
                        공지
                      </span>
                    )}
                    <Link
                      href={`/community/${slug}/${post.id}`}
                      className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate transition-colors"
                    >
                      {post.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                    <span className="text-xs text-muted-foreground hidden sm:block">{post.author ?? "—"}</span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {new Date(post.created_at).toLocaleDateString("ko-KR")}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      조회 {(post.view_count ?? 0).toLocaleString()}
                    </span>
                    {editable && (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/community/${slug}/${post.id}/edit`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                          aria-label="수정"
                        >
                          <Pencil size={14} />
                        </Link>
                        <form action={deletePost}>
                          <input type="hidden" name="post_id" value={post.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <button
                            type="submit"
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="삭제"
                          >
                            <Trash2 size={14} />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center py-16 text-muted-foreground text-sm">
            등록된 게시물이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
