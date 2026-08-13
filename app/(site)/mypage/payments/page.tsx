import { CreditCard } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PaymentsList from "./PaymentsList";
import { PAGE_SIZE_OPTIONS, type MyPaymentRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function PaymentsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: member } = await admin.from("members").select("id").eq("user_id", user!.id).maybeSingle();

  let payments: MyPaymentRow[] = [];
  let totalCount = 0;

  if (member) {
    const { data: orders, count } = await admin
      .from("orders")
      .select(
        "id, order_code, company_name, manager_name, category, product_name, contract_start, contract_end, paid_amount, status, created_at",
        { count: "exact" }
      )
      .eq("manager_member_id", member.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    totalCount = count ?? 0;
    payments = (orders ?? []).map((o, index) => ({
      id: o.id,
      number: totalCount - offset - index,
      orderCode: o.order_code,
      companyName: o.company_name,
      managerName: o.manager_name,
      category: o.category,
      productName: o.product_name,
      contractStart: o.contract_start,
      contractEnd: o.contract_end,
      paidAmount: o.paid_amount,
      status: o.status,
    }));
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">결제 내역</h1>

      {payments.length > 0 ? (
        <PaymentsList payments={payments} page={page} limit={limit} totalPages={totalPages} />
      ) : (
        <div className="rounded-xl border border-border bg-white flex flex-col items-center justify-center py-20 text-muted-foreground">
          <CreditCard size={40} className="mb-3 opacity-30" />
          <p className="text-sm">결제 내역이 없습니다.</p>
          <p className="text-xs mt-1 opacity-70">결제 완료 후 내역이 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
