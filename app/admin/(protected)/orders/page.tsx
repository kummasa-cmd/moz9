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
  if (status === "결제완료") return "default" as const;
  if (status === "취소") return "destructive" as const;
  return "secondary" as const;
}

export default async function AdminOrdersPage() {
  const supabase = await createClient();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_no, customer, product, amount, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="주문목록"
        description={`전체 ${orders?.length ?? 0}건의 주문이 등록되어 있습니다.`}
        actionHref="/admin/orders/new"
        actionLabel="주문등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">주문 목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>주문번호</TableHead>
              <TableHead>고객</TableHead>
              <TableHead>상품</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>주문일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(orders ?? []).map((o) => (
              <TableRow key={o.id}>
                <TableCell className="font-medium">{o.order_no}</TableCell>
                <TableCell className="text-muted-foreground">{o.customer}</TableCell>
                <TableCell className="text-muted-foreground">{o.product}</TableCell>
                <TableCell className="text-muted-foreground">{o.amount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                </TableCell>
              </TableRow>
            ))}

            {orders && orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  등록된 주문이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
