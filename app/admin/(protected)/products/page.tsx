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
import { createAdminClient } from "@/lib/supabase/admin";

function statusVariant(status: string) {
  return status === "판매중" ? ("default" as const) : ("secondary" as const);
}

function formatPrice(setupFee: string | null, monthlyFee: string | null) {
  if (setupFee && monthlyFee) return `${setupFee} + 월 ${monthlyFee}`;
  if (setupFee) return setupFee;
  if (monthlyFee) return `월 ${monthlyFee}`;
  return "협의";
}

export default async function AdminProductsPage() {
  const supabase = createAdminClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, type, setup_fee, monthly_fee, status")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="상품목록"
        description={`전체 ${products?.length ?? 0}개의 상품이 등록되어 있습니다.`}
        actionHref="/admin/products/new"
        actionLabel="상품등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">상품 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상품명</TableHead>
              <TableHead>구분</TableHead>
              <TableHead>가격</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(products ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground">{p.type}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatPrice(p.setup_fee, p.monthly_fee)}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}

            {products && products.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  등록된 상품이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
