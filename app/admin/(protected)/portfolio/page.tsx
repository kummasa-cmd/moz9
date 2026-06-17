import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { deletePortfolioItem } from "./actions";

function statusVariant(status: string) {
  return status === "공개" ? ("default" as const) : ("secondary" as const);
}

export default async function AdminPortfolioPage() {
  const supabase = await createClient();
  const { data: portfolios, error } = await supabase
    .from("portfolio_items")
    .select("id, title, category, status, created_at, thumbnail_url")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="포트폴리오 목록"
        description={`전체 ${portfolios?.length ?? 0}개의 포트폴리오가 등록되어 있습니다.`}
        actionHref="/admin/portfolio/new"
        actionLabel="포트폴리오 등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">썸네일</TableHead>
              <TableHead>제목</TableHead>
              <TableHead className="w-32">카테고리</TableHead>
              <TableHead className="w-28">등록일</TableHead>
              <TableHead className="w-20">상태</TableHead>
              <TableHead className="w-20 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(portfolios ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.thumbnail_url ? (
                    <img
                      src={p.thumbnail_url}
                      alt={p.title}
                      className="w-12 h-9 object-cover rounded border border-border"
                    />
                  ) : (
                    <div className="w-12 h-9 rounded border border-border bg-muted" />
                  )}
                </TableCell>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell className="text-muted-foreground">{p.category}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/portfolio/${p.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deletePortfolioItem}>
                      <input type="hidden" name="id" value={p.id} />
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

            {portfolios && portfolios.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  등록된 포트폴리오가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
