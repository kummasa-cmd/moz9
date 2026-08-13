"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateOrderCode } from "@/lib/order-code";

export type OrderVendorResult = {
  id: string;
  company_name: string;
  ceo_name: string | null;
};

export async function searchVendors(query: string): Promise<OrderVendorResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("vendors")
    .select("id, company_name, ceo_name")
    .eq("is_active", true)
    .ilike("company_name", `%${q}%`)
    .order("company_name", { ascending: true })
    .limit(10);

  return data ?? [];
}

function readOrderFields(formData: FormData) {
  return {
    vendor_id: String(formData.get("vendor_id") ?? "") || null,
    company_name: String(formData.get("company_name") ?? ""),
    category: String(formData.get("category") ?? "홈페이지"),
    vat_type: String(formData.get("vat_type") ?? "별도"),
    product_name: String(formData.get("product_name") ?? ""),
    total_amount: Number(formData.get("total_amount") ?? 0) || 0,
    paid_amount: Number(formData.get("paid_amount") ?? 0) || 0,
    refund_amount: Number(formData.get("refund_amount") ?? 0) || 0,
    status: String(formData.get("status") ?? "입금대기"),
    paid_at: String(formData.get("paid_at") ?? "") || null,
    manager_member_id: String(formData.get("manager_member_id") ?? "") || null,
    manager_name: String(formData.get("manager_name") ?? "") || null,
    manager_phone: String(formData.get("manager_phone") ?? "") || null,
    manager_email: String(formData.get("manager_email") ?? "") || null,
    contract_start: String(formData.get("contract_start") ?? "") || null,
    contract_end: String(formData.get("contract_end") ?? "") || null,
    memo: String(formData.get("memo") ?? "") || null,
    is_active: formData.get("is_active") === "Y",
  };
}

export async function createOrder(formData: FormData) {
  const fields = readOrderFields(formData);

  if (!fields.vendor_id) {
    redirect(`/admin/orders/new?error=${encodeURIComponent("거래처에서 회사명을 검색해 선택해 주세요.")}`);
  }
  if (!fields.manager_member_id) {
    redirect(
      `/admin/orders/new?error=${encodeURIComponent("회원정보에서 거래처 회원을 검색해 관리자를 선택해 주세요.")}`
    );
  }

  const supabase = createAdminClient();
  const order_code = await generateOrderCode(supabase);
  const { error } = await supabase.from("orders").insert({ ...fields, order_code });

  if (error) {
    redirect(`/admin/orders/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/orders");
  redirect("/admin/orders");
}

export async function updateOrder(id: string, formData: FormData) {
  const fields = readOrderFields(formData);

  if (!fields.vendor_id) {
    redirect(
      `/admin/orders/${id}/edit?error=${encodeURIComponent("거래처에서 회사명을 검색해 선택해 주세요.")}`
    );
  }
  if (!fields.manager_member_id) {
    redirect(
      `/admin/orders/${id}/edit?error=${encodeURIComponent(
        "회원정보에서 거래처 회원을 검색해 관리자를 선택해 주세요."
      )}`
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/admin/orders/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/orders");
  redirect("/admin/orders");
}

export async function deleteOrder(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("orders").delete().eq("id", id);

  revalidatePath("/admin/orders");
}
