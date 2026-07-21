import { CheckCircle, Send } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAdminClient } from "@/lib/supabase/admin";
import { replyConsultation } from "./actions";
import ConsultingTable from "./ConsultingTable";
import { PAGE_SIZE_OPTIONS, type AdminConsultationRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type ConsultingPageProps = {
  searchParams: Promise<{ id?: string; error?: string; page?: string; limit?: string }>;
};

export default async function AdminConsultingPage({ searchParams }: ConsultingPageProps) {
  const { id, error, ...sp } = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const { data: consultations, error: fetchError, count } = await supabase
    .from("consultations")
    .select("id, name, email, phone, subject, message, channel, status, admin_reply, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: AdminConsultationRow[] = (consultations ?? []).map((c, i) => ({
    id: c.id,
    number: totalCount - offset - i,
    name: c.name,
    subject: c.subject,
    channel: c.channel,
    status: c.status,
    createdAt: c.created_at,
  }));

  const selected = consultations?.find((c) => c.id === id) ?? consultations?.[0];

  return (
    <div>
      <PageHeader
        title="상담목록"
        description={`/contact 무료상담 폼과 마이페이지로 접수된 ${totalCount}건의 문의입니다.`}
      />

      {fetchError && (
        <p className="text-sm text-destructive mb-4">상담 목록을 불러오지 못했습니다: {fetchError.message}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ConsultingTable
            consultations={rows}
            selectedId={selected?.id}
            page={page}
            limit={limit}
            totalPages={totalPages}
          />
        </div>

        {selected && (
          <div className="rounded-xl border border-border bg-white p-5 h-fit">
            <p className="text-xs text-muted-foreground mb-1">
              {selected.name}
              {selected.email && <> · {selected.email}</>}
              {selected.phone && <> · {selected.phone}</>}
            </p>
            <p className="text-sm text-foreground font-semibold mb-3">{selected.subject}</p>
            <p className="text-sm text-foreground whitespace-pre-wrap mb-5 pb-5 border-b border-border">
              {selected.message}
            </p>

            {selected.status === "답변완료" ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                <CheckCircle size={36} className="text-primary" />
                <p className="text-sm text-foreground font-medium">답변이 등록되었습니다</p>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selected.admin_reply}</p>
              </div>
            ) : (
              <form action={replyConsultation.bind(null, selected.id)} className="space-y-3">
                <input type="hidden" name="page" value={page} />
                <input type="hidden" name="limit" value={limit} />
                <Label htmlFor="answer">답변</Label>
                <Textarea id="answer" name="answer" rows={6} required placeholder="답변 내용을 입력해 주세요" />

                {error && <p className="text-xs text-destructive">{error}</p>}

                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors w-full"
                >
                  <Send size={14} />
                  답변 등록
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
