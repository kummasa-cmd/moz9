"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export type PartnerMemberResult = {
  id: string;
  name: string;
  phone: string | null;
  email: string;
};

export async function searchPartnerMembers(query: string): Promise<PartnerMemberResult[]> {
  const q = query.trim();
  if (!q) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("members")
    .select("id, name, phone, email")
    .eq("is_partner", true)
    .ilike("name", `%${q}%`)
    .order("name", { ascending: true })
    .limit(10);

  return data ?? [];
}

function readVendorFields(formData: FormData) {
  return {
    company_name: String(formData.get("company_name") ?? ""),
    ceo_name: String(formData.get("ceo_name") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    business_reg_no: String(formData.get("business_reg_no") ?? "") || null,
    address: String(formData.get("address") ?? "") || null,
    homepage: String(formData.get("homepage") ?? "") || null,
    manager_member_id: String(formData.get("manager_member_id") ?? "") || null,
    manager_name: String(formData.get("manager_name") ?? "") || null,
    manager_phone: String(formData.get("manager_phone") ?? "") || null,
    manager_email: String(formData.get("manager_email") ?? "") || null,
    is_active: formData.get("is_active") === "Y",
  };
}

export async function createVendor(formData: FormData) {
  const fields = readVendorFields(formData);

  if (!fields.manager_member_id) {
    redirect(
      `/admin/orders/vendors/new?error=${encodeURIComponent(
        "회원관리에서 거래처로 체크된 회원 중 관리자를 검색해 선택해 주세요."
      )}`
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("vendors").insert(fields);

  if (error) {
    redirect(`/admin/orders/vendors/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/orders/vendors");
  redirect("/admin/orders/vendors");
}

export async function updateVendor(id: string, formData: FormData) {
  const fields = readVendorFields(formData);

  if (!fields.manager_member_id) {
    redirect(
      `/admin/orders/vendors/${id}/edit?error=${encodeURIComponent(
        "회원관리에서 거래처로 체크된 회원 중 관리자를 검색해 선택해 주세요."
      )}`
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("vendors")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/admin/orders/vendors/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/orders/vendors");
  redirect("/admin/orders/vendors");
}

export async function deleteVendor(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("vendors").delete().eq("id", id);

  revalidatePath("/admin/orders/vendors");
}
