import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, MessageSquare, CornerDownRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/server";
import { addComment, deleteComment } from "./actions";

type Props = {
  params: Promise<{ id: string; postId: string }>;
  searchParams: Promise<{ reply?: string }>;
};

type Comment = {
  id: string;
  parent_id: string | null;
  author_name: string;
  content: string;
  created_at: string;
};

export default async function AdminBoardPostDetailPage({ params, searchParams }: Props) {
  const { id: boardId, postId } = await params;
  const { reply: replyToId } = await searchParams;
  const supabase = await createClient();

  const [{ data: board }, { data: post }, { data: rawComments }] = await Promise.all([
    supabase.from("boards").select("id, name, use_comment").eq("id", boardId).maybeSingle(),
    supabase
      .from("board_posts")
      .select("id, title, content, author, published_at, created_at, view_count, is_notice, status")
      .eq("id", postId)
      .eq("board_id", boardId)
      .maybeSingle(),
    supabase
      .from("board_comments")
      .select("id, parent_id, author_name, content, created_at")
      .eq("post_id", postId)
      .order("created_at", { ascending: true }),
  ]);

  if (!board || !post) notFound();

  const comments = rawComments as Comment[] | null;
  const topComments = (comments ?? []).filter((c) => !c.parent_id);
  const replyMap = new Map<string, Comment[]>();
  for (const c of comments ?? []) {
    if (c.parent_id) {
      const list = replyMap.get(c.parent_id) ?? [];
      list.push(c);
      replyMap.set(c.parent_id, list);
    }
  }

  const totalComments = (comments ?? []).length;
  const displayDate = new Date(post.published_at ?? post.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const boundAddComment = addComment.bind(null, boardId, postId);

  return (
    <div className="max-w-3xl">
      {/* Top navigation */}
      <div className="flex items-center justify-between mb-4">
        <Link
          href={`/admin/site/board/${boardId}/posts`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={14} />
          {board.name} 목록으로
        </Link>
        <Link
          href={`/admin/site/board/${boardId}/posts/${postId}/edit`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Pencil size={13} />
          수정
        </Link>
      </div>

      {/* Post card */}
      <div className="rounded-xl border border-border bg-white p-8">
        {/* Title */}
        <div className="mb-4">
          {post.is_notice && (
            <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-primary text-white mr-2">
              공지
            </span>
          )}
          <h1 className="inline text-2xl font-bold text-foreground">{post.title}</h1>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mb-6 pb-6 border-b border-border">
          <span>작성자: <strong className="text-foreground">{post.author ?? "—"}</strong></span>
          <span>등록일: {displayDate}</span>
          <span>조회수: {(post.view_count ?? 0).toLocaleString()}</span>
          <Badge variant={post.status === "게시중" ? "default" : "secondary"} className="ml-auto">
            {post.status}
          </Badge>
        </div>

        {/* Content — from TipTap HTML */}
        <div
          className="board-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </div>

      {/* Comments section */}
      {board.use_comment && (
        <div className="mt-6">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare size={16} />
            댓글 {totalComments > 0 && <span className="text-muted-foreground font-normal text-sm">({totalComments})</span>}
          </h2>

          {/* Comment list */}
          <div className="space-y-3">
            {topComments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-border bg-white">
                아직 댓글이 없습니다.
              </p>
            )}

            {topComments.map((c) => {
              const replies = replyMap.get(c.id) ?? [];
              const isReplyTarget = replyToId === c.id;

              return (
                <div key={c.id} className="rounded-xl border border-border bg-white overflow-hidden">
                  {/* Top-level comment */}
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-foreground">{c.author_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {new Date(c.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      <form action={deleteComment} className="flex-shrink-0">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="board_id" value={boardId} />
                        <input type="hidden" name="post_id" value={postId} />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="댓글 삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                    <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap">{c.content}</p>

                    {/* Reply button */}
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

                  {/* Replies */}
                  {replies.map((r) => (
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
                      <form action={deleteComment} className="flex-shrink-0">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="board_id" value={boardId} />
                        <input type="hidden" name="post_id" value={postId} />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="답글 삭제"
                        >
                          <Trash2 size={13} />
                        </button>
                      </form>
                    </div>
                  ))}

                  {/* Inline reply form */}
                  {isReplyTarget && (
                    <form
                      action={boundAddComment}
                      className="px-5 py-4 border-t border-border bg-muted/20"
                    >
                      <input type="hidden" name="parent_id" value={c.id} />
                      <p className="text-xs text-muted-foreground mb-3 flex items-center gap-1">
                        <CornerDownRight size={12} />
                        <strong className="text-foreground">{c.author_name}</strong>님에게 답글 작성
                      </p>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor={`reply-author-${c.id}`} className="text-xs">작성자</Label>
                          <Input
                            id={`reply-author-${c.id}`}
                            name="author_name"
                            defaultValue="관리자"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`reply-content-${c.id}`} className="text-xs">내용</Label>
                          <Textarea
                            id={`reply-content-${c.id}`}
                            name="content"
                            rows={3}
                            required
                            placeholder="답글을 입력하세요"
                            className="text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center gap-1 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-white hover:bg-primary/90 transition-colors"
                          >
                            답글 등록
                          </button>
                          <Link
                            href="?"
                            className="inline-flex items-center justify-center rounded-md border border-border px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            취소
                          </Link>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>

          {/* New comment form */}
          <form
            action={boundAddComment}
            className="mt-4 rounded-xl border border-border bg-white p-5 space-y-3"
          >
            <p className="text-sm font-medium text-foreground">댓글 작성</p>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label htmlFor="comment-author" className="text-xs">작성자</Label>
                <Input
                  id="comment-author"
                  name="author_name"
                  defaultValue="관리자"
                  className="h-8 text-sm"
                />
              </div>
              <div className="sm:col-span-3 space-y-1">
                <Label htmlFor="comment-content" className="text-xs">내용</Label>
                <Textarea
                  id="comment-content"
                  name="content"
                  rows={3}
                  required
                  placeholder="댓글을 입력하세요"
                  className="text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
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
