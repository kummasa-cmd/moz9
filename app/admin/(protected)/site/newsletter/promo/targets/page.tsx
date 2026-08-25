import { UserPlus, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  addProspect,
  bulkAddProspects,
  deleteProspect,
  deleteProspects,
  deleteSuppression,
  deleteSuppressions,
} from "./actions";
import ProspectsTable from "./ProspectsTable";
import SuppressionsTable from "./SuppressionsTable";
import { PAGE_SIZE_OPTIONS, type ProspectRow, type SuppressionRow } from "../../types";

const DEFAULT_PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    suppressedPage?: string;
    suppressedLimit?: string;
    error?: string;
    imported?: string;
  }>;
};

export default async function AdminNewsletterPromoTargetsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const suppressedLimit = PAGE_SIZE_OPTIONS.includes(Number(sp.suppressedLimit))
    ? Number(sp.suppressedLimit)
    : DEFAULT_PAGE_SIZE;
  const suppressedPage = Math.max(1, Number(sp.suppressedPage) || 1);
  const suppressedOffset = (suppressedPage - 1) * suppressedLimit;

  const supabase = createAdminClient();
  const [
    { data: prospects, error, count },
    { data: suppressions, count: suppressedCount },
  ] = await Promise.all([
    supabase
      .from("newsletter_prospects")
      .select("id, email, name, source, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("newsletter_suppressions")
      .select("id, email, unsubscribed_at", { count: "exact" })
      .order("unsubscribed_at", { ascending: false })
      .range(suppressedOffset, suppressedOffset + suppressedLimit - 1),
  ]);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const totalSuppressedCount = suppressedCount ?? 0;
  const totalSuppressedPages = Math.max(1, Math.ceil(totalSuppressedCount / suppressedLimit));

  const rows: ProspectRow[] = (prospects ?? []).map((p) => ({
    id: p.id,
    email: p.email,
    name: p.name,
    source: p.source,
    createdAt: p.created_at,
  }));

  const suppressionRows: SuppressionRow[] = (suppressions ?? []).map((s) => ({
    id: s.id,
    email: s.email,
    unsubscribedAt: s.unsubscribed_at,
  }));

  return (
    <div>
      <PageHeader
        title="홍보 뉴스레터 대상자 관리"
        description={`전체 ${totalCount}명 · 아직 구독자가 아닌, 홍보 뉴스레터를 발송할 이메일 목록입니다.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <form action={addProspect} className="rounded-xl border border-border bg-white p-5 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <UserPlus size={15} />
            개별 등록
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prospect-email">이메일</Label>
              <Input id="prospect-email" name="email" type="email" required placeholder="hello@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prospect-name">이름 (선택)</Label>
              <Input id="prospect-name" name="name" placeholder="홍길동" />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            등록
          </button>
        </form>

        <form action={bulkAddProspects} className="rounded-xl border border-border bg-white p-5 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Upload size={15} />
            여러 명 한 번에 등록
          </p>
          <Textarea
            name="emails"
            rows={3}
            placeholder={"한 줄에 이메일 하나씩 붙여넣어 주세요.\nhello@example.com, 홍길동 (이름은 선택)"}
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            일괄 등록
          </button>
        </form>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {error.message}</p>
      )}
      {sp.error && <p className="text-sm text-destructive mb-4">{sp.error}</p>}
      {sp.imported && (
        <p className="text-sm text-primary mb-4">{sp.imported}건이 등록되었습니다 (중복 이메일은 건너뜀).</p>
      )}

      <ProspectsTable
        prospects={rows}
        page={page}
        limit={limit}
        totalPages={totalPages}
        deleteProspectAction={deleteProspect}
        deleteProspectsAction={deleteProspects}
      />

      <div className="mt-10">
        <h2 className="text-base font-semibold text-foreground mb-1">수신거부자 목록</h2>
        <p className="text-sm text-muted-foreground mb-4">
          전체 {totalSuppressedCount}명 · 홍보/실제 뉴스레터 모두 발송이 차단된 이메일입니다. 삭제하면 다시
          발송 대상이 됩니다.
        </p>

        <SuppressionsTable
          suppressions={suppressionRows}
          page={suppressedPage}
          limit={suppressedLimit}
          totalPages={totalSuppressedPages}
          deleteSuppressionAction={deleteSuppression}
          deleteSuppressionsAction={deleteSuppressions}
        />
      </div>
    </div>
  );
}
