import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Pencil, Trash2, MessageSquare, CornerDownRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/community-auth";
import { deletePost } from "../actions";
import { addComment, deleteComment } from "./actions";

type Props = {
  params: Promise<{ slug: string; postId: string }>;
  searchParams: Promise<{ reply?: string }>;
};

type Comment = {
  id: string;
  parent_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
  user_id: string | null;
};

export default async function CommunityPostDetailPage({ params, searchParams }: Props) {
  const { slug, postId } = await params;
  const { reply: replyToId } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = await isAdmin();
  const db = createAdminClient();

  const { data: board } = await db
    .from("boards")
    .select("id, name, slug, type, use_comment, allow_user_write")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board) notFound();

  const isPrivate = board.type === "개인";

  const { data: post } = await db
    .from("board_posts")
    .select("id, title, content, author, created_at, published_at, view_count, is_notice, user_id")
    .eq("id", postId)
    .eq("board_id", board.id)
    .eq("status", "게시중")
    .maybeSingle();

  if (!post) notFound();

  if (isPrivate && !admin) {
    if (!user) redirect(`/login?next=/community/${slug}/${postId}`);
    if (post.user_id !== user.id) redirect(`/community/${slug}`);
  }

  // Increment view count
  await db
    .from("board_posts")
    .update({ view_count: (post.view_count ?? 0) + 1 })
    .eq("id", postId);

  const { data: rawComments } = board.use_comment
    ? await db
        .from("board_comments")
        .select("id, parent_id, author_name, content, created_at, user_id")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
    : { data: [] };

  const comments = (rawComments ?? []) as Comment[];
  const topComments = comments.filter((c) => !c.parent_id);
  const replyMap = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const list = replyMap.get(c.parent_id) ?? [];
      list.push(c);
      replyMap.set(c.parent_id, list);
    }
  }

  const editable = admin || (board.allow_user_write && user !== null && user.id === post.user_id);
  const displayDate = new Date(post.published_at ?? post.created_at).toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
  });
  const boundAddComment = addComment.bind(null, slug, postId);
  const isHtml = post.content?.trim().startsWith("<");

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href={`/community/${slug}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ChevronLeft size={14} />
        {board.name}
      </Link>

      {/* Post card */}
      <div className="rounded-xl border border-border bg-white p-8 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {post.is_notice && (
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-primary text-white mr-2">
                공지
              </span>
            )}
            <h1 className="inline text-2xl font-bold text-foreground">{post.title}</h1>
          </div>
          {editable && (
            <div className="flex items-center gap-3 flex-shrink-0">
              <Link
                href={`/community/${slug}/${postId}/edit`}
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="수정"
              >
                <Pencil size={15} />
              </Link>
              <form action={deletePost}>
                <input type="hidden" name="post_id" value={postId} />
                <input type="hidden" name="slug" value={slug} />
                <button type="submit" className="text-muted-foreground hover:text-destructive transition-colors" aria-label="삭제">
                  <Trash2 size={15} />
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
          <span>작성자: <strong className="text-foreground">{post.author ?? "—"}</strong></span>
          <span>{displayDate}</span>
          <span>조회 {(post.view_count ?? 0).toLocaleString()}</span>
        </div>

        {isHtml ? (
          <div className="board-content" dangerouslySetInnerHTML={{ __html: post.content }} />
        ) : (
          <div className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {post.content}
          </div>
        )}
      </div>

      {/* Comments */}
      {board.use_comment && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare size={16} />
            댓글
            {comments.length > 0 && (
              <span className="text-muted-foreground font-normal text-sm">({comments.length})</span>
            )}
          </h2>

          <div className="space-y-3">
            {topComments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-border bg-white">
                아직 댓글이 없습니다.
              </p>
            )}

            {topComments.map((c) => {
              const replies = replyMap.get(c.id) ?? [];
              const isReplyTarget = replyToId === c.id;
              const canDeleteComment = admin || (user && c.user_id === user.id);

              return (
                <div key={c.id} className="rounded-xl border border-border bg-white overflow-hidden">
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-sm font-semibold text-foreground">{c.author_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(c.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      {canDeleteComment && (
                        <form action={deleteComment}>
                          <input type="hidden" name="comment_id" value={c.id} />
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="post_id" value={postId} />
                          <button type="submit" className="text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </form>
                      )}
                    </div>
                    <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap">{c.content}</p>
                    {!isReplyTarget && (
                      <Link
                        href={`?reply=${c.id}`}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-2 transition-colors"
                      >
                        <CornerDownRight size={12} />
                        답글
                      </Link>
                    )}
                  </div>

                  {replies.map((r) => {
                    const canDeleteReply = admin || (user && r.user_id === user.id);
                    return (
                      <div key={r.id} className="px-5 py-3 border-t border-border bg-muted/30 flex items-start justify-between gap-2">
                        <div className="flex gap-2 min-w-0">
                          <CornerDownRight size={14} className="text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="text-sm font-semibold text-foreground">{r.author_name}</span>
                            <span className="text-xs text-muted-foreground ml-2">
                              {new Date(r.created_at).toLocaleDateString("ko-KR")}
                            </span>
                            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{r.content}</p>
                          </div>
                        </div>
                        {canDeleteReply && (
                          <form action={deleteComment}>
                            <input type="hidden" name="comment_id" value={r.id} />
                            <input type="hidden" name="slug" value={slug} />
                            <input type="hidden" name="post_id" value={postId} />
                            <button type="submit" className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </form>
                        )}
                      </div>
                    );
                  })}

                  {isReplyTarget && (
                    <form action={boundAddComment} className="px-5 py-4 border-t border-border bg-muted/20 space-y-3">
                      <input type="hidden" name="parent_id" value={c.id} />
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CornerDownRight size={12} />
                        <strong className="text-foreground">{c.author_name}</strong>님에게 답글 작성
                      </p>
                      {!user && (
                        <div className="space-y-1">
                          <Label htmlFor={`reply-author-${c.id}`} className="text-xs">작성자</Label>
                          <Input id={`reply-author-${c.id}`} name="author_name" className="h-8 text-sm" placeholder="이름" />
                        </div>
                      )}
                      <div className="space-y-1">
                        <Label htmlFor={`reply-content-${c.id}`} className="text-xs">내용</Label>
                        <Textarea id={`reply-content-${c.id}`} name="content" rows={3} required placeholder="답글을 입력하세요" className="text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="submit" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors">
                          답글 등록
                        </button>
                        <Link href="?" className="inline-flex items-center justify-center rounded-md border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors">
                          취소
                        </Link>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {/* New comment form */}
          <form action={boundAddComment} className="mt-4 rounded-xl border border-border bg-white p-5 space-y-3">
            <p className="text-sm font-medium text-foreground">댓글 작성</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="comment-author" className="text-xs">작성자</Label>
                <Input
                  id="comment-author"
                  name="author_name"
                  className="h-8 text-sm"
                  defaultValue={user ? (user.user_metadata?.name ?? user.email ?? "") : ""}
                  placeholder={user ? undefined : "이름"}
                  readOnly={!!user}
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label htmlFor="comment-content" className="text-xs">내용</Label>
                <Textarea id="comment-content" name="content" rows={3} required placeholder="댓글을 입력하세요" className="text-sm" />
              </div>
            </div>
            <div className="flex justify-end">
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
                <MessageSquare size={14} />
                댓글 등록
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
