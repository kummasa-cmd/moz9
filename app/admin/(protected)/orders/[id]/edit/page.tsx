import { notFound } from "next/navigation";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/admin/FormSelect";
import PageHeader from "@/components/admin/PageHeader";
import OrderCompanySearch from "@/components/admin/OrderCompanySearch";
import VendorManagerSearch from "@/components/admin/VendorManagerSearch";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateOrder } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function AdminOrderEditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, order_code, vendor_id, company_name, category, vat_type, product_name, total_amount, paid_amount, refund_amount, status, paid_at, manager_member_id, manager_name, manager_phone, manager_email, contract_start, contract_end, memo, is_active, created_at, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!order) notFound();

  const action = updateOrder.bind(null, id);

  const defaultVendor = order.vendor_id
    ? { id: order.vendor_id, company_name: order.company_name ?? "", ceo_name: null }
    : null;

  const defaultManager = order.manager_member_id
    ? {
        id: order.manager_member_id,
        name: order.manager_name ?? "",
        phone: order.manager_phone ?? null,
        email: order.manager_email ?? "",
      }
    : null;

  return (
    <div className="max-w-2xl">
      <PageHeader title="결제 수정" description="결제 정보를 수정해 주세요." />

      <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-6">
        <OrderCompanySearch defaultVendor={defaultVendor} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="category">구분</Label>
            <FormSelect id="category" name="category" defaultValue={order.category}>
              <option value="홈페이지">홈페이지</option>
              <option value="도메인">도메인</option>
              <option value="부가서비스">부가서비스</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vat_type">부가세 여부</Label>
            <FormSelect id="vat_type" name="vat_type" defaultValue={order.vat_type}>
              <option value="별도">별도</option>
              <option value="포함">포함</option>
            </FormSelect>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="product_name">
            상품명 <span className="text-destructive">*</span>
          </Label>
          <Input id="product_name" name="product_name" required defaultValue={order.product_name ?? ""} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Label htmlFor="total_amount">
              총금액 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="total_amount"
              name="total_amount"
              type="number"
              min="0"
              required
              defaultValue={order.total_amount}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_amount">입금액</Label>
            <Input id="paid_amount" name="paid_amount" type="number" min="0" defaultValue={order.paid_amount} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="refund_amount">환불금액</Label>
            <Input
              id="refund_amount"
              name="refund_amount"
              type="number"
              min="0"
              defaultValue={order.refund_amount}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="status">상태</Label>
            <FormSelect id="status" name="status" defaultValue={order.status}>
              <option value="입금대기">입금대기</option>
              <option value="입금완료">입금완료</option>
              <option value="부분입금">부분입금</option>
              <option value="환불">환불</option>
            </FormSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_at">입금일</Label>
            <Input id="paid_at" name="paid_at" type="date" defaultValue={order.paid_at ?? ""} />
          </div>
        </div>

        <VendorManagerSearch defaultManager={defaultManager} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="contract_start">계약시작일</Label>
            <Input id="contract_start" name="contract_start" type="date" defaultValue={order.contract_start ?? ""} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract_end">계약종료일</Label>
            <Input id="contract_end" name="contract_end" type="date" defaultValue={order.contract_end ?? ""} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="memo">메모</Label>
          <Textarea id="memo" name="memo" rows={4} defaultValue={order.memo ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="is_active">활성여부</Label>
          <FormSelect id="is_active" name="is_active" defaultValue={order.is_active ? "Y" : "N"}>
            <option value="Y">Y</option>
            <option value="N">N</option>
          </FormSelect>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm text-muted-foreground">
          <div className="space-y-1">
            <Label className="text-muted-foreground">결제번호</Label>
            <p className="font-mono">{order.order_code}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">등록일</Label>
            <p>{new Date(order.created_at).toLocaleString("ko-KR")}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-muted-foreground">수정일</Label>
            <p>{new Date(order.updated_at).toLocaleString("ko-KR")}</p>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Save size={15} />
          저장
        </button>
      </form>
    </div>
  );
}
