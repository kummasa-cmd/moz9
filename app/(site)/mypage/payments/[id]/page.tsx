import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PaymentDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: member } = await admin.from("members").select("id").eq("user_id", user!.id).maybeSingle();
  if (!member) notFound();

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_code, company_name, category, vat_type, product_name, total_amount, paid_amount, refund_amount, status, paid_at, manager_name, manager_phone, manager_email, contract_start, contract_end, memo"
    )
    .eq("id", id)
    .eq("manager_member_id", member.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!order) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/payments" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">결제 내역</h1>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 space-y-6">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{order.product_name ?? "-"}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{order.order_code}</p>
          </div>
          <Badge variant={statusVariant(order.status)} className="flex-shrink-0 text-xs">
            {order.status}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="회사명" value={order.company_name ?? "-"} />
          <Field label="구분" value={order.category} />
          <Field label="상품명" value={order.product_name ?? "-"} />
          <Field label="부가세 여부" value={order.vat_type} />
        </div>

        <div className={`grid grid-cols-1 gap-5 pt-5 border-t border-border ${order.refund_amount > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <Field label="총금액" value={formatAmount(order.total_amount)} />
          <Field label="입금액" value={formatAmount(order.paid_amount)} />
          {order.refund_amount > 0 && <Field label="환불금액" value={formatAmount(order.refund_amount)} />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-border">
          <Field label="상태" value={order.status} />
          <Field label="입금일" value={formatDate(order.paid_at)} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-5 border-t border-border">
          <Field label="관리자명" value={order.manager_name ?? "-"} />
          <Field label="관리자 연락처" value={order.manager_phone ?? "-"} />
          <Field label="관리자 이메일" value={order.manager_email ?? "-"} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-5 border-t border-border">
          <Field label="계약시작일" value={formatDate(order.contract_start)} />
          <Field label="계약종료일" value={formatDate(order.contract_end)} />
        </div>

        {order.memo && (
          <div className="pt-5 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1.5">메모</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{order.memo}</p>
          </div>
        )}
      </div>
    </div>
  );
}
