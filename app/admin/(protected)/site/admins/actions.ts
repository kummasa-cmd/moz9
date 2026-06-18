"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSession, hashPassword } from "@/lib/admin-auth";

export async function createAdmin(formData: FormData) {
  const sessionId = await getAdminSession();
  if (!sessionId) redirect("/admin/login");

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
  const sessionId = await getAdminSession();
  if (!sessionId) redirect("/admin/login");

  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "운영자");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("admins")
    .update({ name, role })
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
  const sessionId = await getAdminSession();
  if (!sessionId) redirect("/admin/login");

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
