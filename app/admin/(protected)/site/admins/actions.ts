"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashPassword } from "@/lib/admin-auth";
import { requireAdmin } from "@/lib/admin-guard";

export async function createAdmin(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "운영자");

  const password_hash = await hashPassword(password);

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admins")
    .insert({ name, email, password_hash, role });

  if (error) {
    redirect(
      `/admin/site/admins?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}

export async function updateAdmin(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "운영자");
  const password = String(formData.get("password") ?? "").trim();

  const updateData: Record<string, string> = { name, role };
  if (password) {
    updateData.password_hash = await hashPassword(password);
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admins")
    .update(updateData)
    .eq("id", id);

  if (error) {
    redirect(
      `/admin/site/admins/${id}/edit?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}

export async function deleteAdmin(formData: FormData) {
  const { adminId: sessionId } = await requireAdmin();

  const id = String(formData.get("id") ?? "");

  if (sessionId === id) {
    redirect(
      `/admin/site/admins?error=${encodeURIComponent("현재 로그인한 본인 계정은 삭제할 수 없습니다.")}`,
    );
  }

  const supabase = createAdminClient();
  await supabase.from("admins").delete().eq("id", id);

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}
