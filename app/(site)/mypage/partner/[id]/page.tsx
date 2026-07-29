import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MessageSquare, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addPartnerComment } from "../actions";

const statusVariant = (s: string) => (s === "답변완료" ? ("default" as const) : ("destructive" as const));

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PartnerPostDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("partner_posts")
    .select("id, title, content, status, created_at, processed_at, attachment_url, attachment_name")
    .eq("id", id)
    .eq("member_id", user!.id)
    .maybeSingle();

  if (!post) notFound();

  const isHtml = post.content?.trim().startsWith("<");

  const { data: comments } = await admin
    .from("partner_post_comments")
    .select("id, author_name, content, is_admin, created_at")
    .eq("post_id", id)
    .order("created_at", { ascending: true });

  const boundAddComment = addPartnerComment.bind(null, id);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/partner" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">거래처 게시판</h1>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{post.title}</p>
            <p className="text-xs text-muted-foreground mt-1">
              등록일 {new Date(post.created_at).toLocaleDateString("ko-KR")}
              {post.processed_at && (
                <> · 처리일 {new Date(post.processed_at).toLocaleDateString("ko-KR")}</>
              )}
            </p>
          </div>
          <Badge variant={statusVariant(post.status)} className="flex-shrink-0 text-xs">
            {post.status}
          </Badge>
        </div>

        {isHtml ? (
          <div className="board-content" dangerouslySetInnerHTML={{ __html: post.content }} />
        ) : (
          <p className="text-sm text-foreground whitespace-pre-wrap">{post.content}</p>
        )}

        {post.attachment_url && (
          <a
            href={post.attachment_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Paperclip size={14} />
            {post.attachment_name ?? "첨부파일"}
          </a>
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <MessageSquare size={16} />
          답변 / 대화
          {comments && comments.length > 0 && (
            <span className="text-muted-foreground font-normal text-sm">({comments.length})</span>
          )}
        </h2>

        <div className="space-y-3 mb-4">
          {(!comments || comments.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-6 rounded-xl border border-border bg-white">
              아직 등록된 답변이 없습니다.
            </p>
          )}

          {comments?.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-4 ${
                c.is_admin ? "border-primary/30 bg-primary/5" : "border-border bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {c.is_admin ? "모즈나인 답변" : c.author_name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(c.created_at).toLocaleDateString("ko-KR")}
                </span>
              </div>
              <p className="text-sm text-foreground mt-1.5 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>

        <form action={boundAddComment} className="rounded-xl border border-border bg-white p-5 space-y-3">
          <p className="text-sm font-medium text-foreground">답글 작성</p>
          <Textarea name="content" rows={3} required placeholder="내용을 입력하세요" className="text-sm" />
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <MessageSquare size={14} />
              등록
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
