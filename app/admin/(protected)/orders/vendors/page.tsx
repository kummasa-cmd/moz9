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
import { deleteVendor } from "./actions";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminVendorsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const { data: vendors, error, count } = await supabase
    .from("vendors")
    .select("id, company_name, ceo_name, homepage, manager_name, is_active, created_at, updated_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div>
      <PageHeader
        title="거래처목록"
        description={`전체 ${totalCount}개의 거래처가 등록되어 있습니다.`}
        actionHref="/admin/orders/vendors/new"
        actionLabel="거래처 등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">거래처 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">번호</TableHead>
              <TableHead>회사명</TableHead>
              <TableHead>대표이름</TableHead>
              <TableHead>홈페이지</TableHead>
              <TableHead>관리자이름</TableHead>
              <TableHead className="w-28">등록일</TableHead>
              <TableHead className="w-28">수정일</TableHead>
              <TableHead className="w-20 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(vendors ?? []).map((v, index) => (
              <TableRow key={v.id}>
                <TableCell className="text-muted-foreground">{totalCount - offset - index}</TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {v.company_name}
                    {!v.is_active && <Badge variant="outline">N</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{v.ceo_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {v.homepage ? (
                    <a
                      href={v.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      {v.homepage}
                    </a>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{v.manager_name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(v.updated_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/orders/vendors/${v.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteVendor}>
                      <input type="hidden" name="id" value={v.id} />
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

            {vendors && vendors.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  등록된 거래처가 없습니다.
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
