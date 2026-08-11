import { MessageSquare, Paperclip } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Textarea } from "@/components/ui/textarea";
import { createAdminClient } from "@/lib/supabase/admin";
import { replyPartnerPost } from "./actions";
import PartnerTable from "./PartnerTable";
import PartnerStatusForm from "./PartnerStatusForm";
import PartnerCommentItem from "./PartnerCommentItem";
import { PAGE_SIZE_OPTIONS, type AdminPartnerPostRow, type AdminPartnerComment } from "./types";

const DEFAULT_PAGE_SIZE = 10;

function resolvePartnerName(member?: { partner_name: string | null; nickname: string | null; name: string | null } | null) {
  return member?.partner_name || member?.nickname || member?.name || "알 수 없음";
}

type PartnerPageProps = {
  searchParams: Promise<{ id?: string; error?: string; page?: string; limit?: string }>;
};

export default async function AdminPartnerBoardPage({ searchParams }: PartnerPageProps) {
  const { id, error, ...sp } = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const { data: posts, error: fetchError, count } = await supabase
    .from("partner_posts")
    .select("id, member_id, title, status, created_at, processed_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const memberIds = [...new Set((posts ?? []).map((p) => p.member_id))];
  const { data: members } = memberIds.length
    ? await supabase.from("members").select("user_id, partner_name, nickname, name").in("user_id", memberIds)
    : { data: [] };
  const memberMap = new Map((members ?? []).map((m) => [m.user_id, m]));

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: AdminPartnerPostRow[] = (posts ?? []).map((p, i) => ({
    id: p.id,
    number: totalCount - offset - i,
    partnerName: resolvePartnerName(memberMap.get(p.member_id)),
    title: p.title,
    status: p.status,
    createdAt: p.created_at,
    processedAt: p.processed_at,
  }));

  const selectedSummary = posts?.find((p) => p.id === id) ?? posts?.[0];

  let selectedDetail: { content: string; attachment_url: string | null; attachment_name: string | null } | null = null;
  let comments: AdminPartnerComment[] = [];

  if (selectedSummary) {
    const { data: detail } = await supabase
      .from("partner_posts")
      .select("content, attachment_url, attachment_name")
      .eq("id", selectedSummary.id)
      .maybeSingle();
    selectedDetail = detail ?? null;

    const { data: rawComments } = await supabase
      .from("partner_post_comments")
      .select("id, author_name, content, is_admin, created_at")
      .eq("post_id", selectedSummary.id)
      .order("created_at", { ascending: true });

    comments = (rawComments ?? []).map((c) => ({
      id: c.id,
      authorName: c.author_name,
      content: c.content,
      isAdmin: c.is_admin,
      createdAt: c.created_at,
    }));
  }

  return (
    <div>
      <PageHeader
        title="거래처 게시판"
        description={`마이페이지 거래처 게시판으로 접수된 ${totalCount}건의 문의입니다.`}
      />
      {fetchError && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {fetchError.message}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <PartnerTable posts={rows} selectedId={selectedSummary?.id} page={page} limit={limit} totalPages={totalPages} />
        </div>

        {selectedSummary && selectedDetail && (
          <div className="rounded-xl border border-border bg-white p-5 h-fit space-y-4">
            <div className="flex items-start justify-between gap-2 pb-4 border-b border-border">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-1">
                  {resolvePartnerName(memberMap.get(selectedSummary.member_id))}
                </p>
                <p className="text-sm text-foreground font-medium">{selectedSummary.title}</p>
              </div>
              <PartnerStatusForm
                postId={selectedSummary.id}
                status={selectedSummary.status}
                page={page}
                limit={limit}
              />
            </div>

            {selectedDetail.content.trim().startsWith("<") ? (
              <div className="board-content text-sm" dangerouslySetInnerHTML={{ __html: selectedDetail.content }} />
            ) : (
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedDetail.content}</p>
            )}

            {selectedDetail.attachment_url && (
              <a
                href={selectedDetail.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <Paperclip size={14} />
                {selectedDetail.attachment_name ?? "첨부파일"}
              </a>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">아직 댓글이 없습니다.</p>
              )}
              {comments.map((c) => (
                <PartnerCommentItem key={c.id} comment={c} page={page} limit={limit} />
              ))}
            </div>

            <form action={replyPartnerPost.bind(null, selectedSummary.id)} className="space-y-3 pt-2 border-t border-border">
              <input type="hidden" name="page" value={page} />
              <input type="hidden" name="limit" value={limit} />
              <Textarea name="content" rows={4} required placeholder="답변 내용을 입력해 주세요" />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors w-full"
              >
                <MessageSquare size={14} />
                답변 등록
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
