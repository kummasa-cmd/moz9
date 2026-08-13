import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import Pagination from "@/components/admin/Pagination";
import { PAGE_SIZE_OPTIONS } from "@/components/admin/pagination-constants";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteOrder } from "./actions";

const DEFAULT_PAGE_SIZE = 10;

function statusVariant(status: string) {
  if (status === "입금완료") return "default" as const;
  if (status === "환불") return "destructive" as const;
  return "secondary" as const;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "-";
}

function formatAmount(value: number) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminOrdersPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const { data: orders, error, count } = await supabase
    .from("orders")
    .select(
      "id, order_code, company_name, manager_name, category, product_name, contract_start, contract_end, total_amount, status, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div>
      <PageHeader
        title="결제목록"
        description={`전체 ${totalCount}건의 결제가 등록되어 있습니다.`}
        actionHref="/admin/orders/new"
        actionLabel="결제등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">결제 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">번호</TableHead>
              <TableHead>결제코드</TableHead>
              <TableHead>회사명</TableHead>
              <TableHead>관리자명</TableHead>
              <TableHead>구분</TableHead>
              <TableHead>상품명</TableHead>
              <TableHead className="w-28">계약시작일</TableHead>
              <TableHead className="w-28">계약종료일</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-20 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orders ?? []).map((o, index) => (
              <TableRow key={o.id}>
                <TableCell className="text-muted-foreground">{totalCount - offset - index}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{o.order_code}</TableCell>
                <TableCell className="font-medium">{o.company_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{o.manager_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{o.category}</TableCell>
                <TableCell className="text-muted-foreground">{o.product_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.contract_start)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(o.contract_end)}</TableCell>
                <TableCell className="text-muted-foreground">{formatAmount(o.total_amount)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/orders/${o.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteOrder}>
                      <input type="hidden" name="id" value={o.id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {orders && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-10">
                  등록된 결제가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} limit={limit} totalPages={totalPages} />
    </div>
  );
}
