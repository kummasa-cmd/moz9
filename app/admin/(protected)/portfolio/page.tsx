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

function statusVariant(status: string) {
  return status === "공개" ? ("default" as const) : ("secondary" as const);
}

export default async function AdminPortfolioPage() {
  const supabase = await createClient();
  const { data: portfolios, error } = await supabase
    .from("portfolio_items")
    .select("id, title, category, status, created_at")
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
              <TableHead>제목</TableHead>
              <TableHead>카테고리</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(portfolios ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell className="text-muted-foreground">{p.category}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}

            {portfolios && portfolios.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
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
