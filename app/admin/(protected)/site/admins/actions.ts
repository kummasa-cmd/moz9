"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function createAdmin(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "운영자");

  const supabase = createAdminClient();

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    redirect(`/admin/site/admins?error=${encodeURIComponent(authError?.message ?? "관리자 생성에 실패했습니다.")}`);
  }

  const { error: profileError } = await supabase
    .from("admin_profiles")
    .insert({ id: created.user.id, name, email, role });

  if (profileError) {
    redirect(`/admin/site/admins?error=${encodeURIComponent(profileError.message)}`);
  }

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}

export async function updateAdmin(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const role = String(formData.get("role") ?? "운영자");

  const supabase = await createClient();
  const { error } = await supabase.from("admin_profiles").update({ name, role }).eq("id", id);

  if (error) {
    redirect(`/admin/site/admins/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}

export async function deleteAdmin(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (auth.user?.id === id) {
    redirect(`/admin/site/admins?error=${encodeURIComponent("현재 로그인한 본인 계정은 삭제할 수 없습니다.")}`);
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(id);

  if (error) {
    redirect(`/admin/site/admins?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/admins");
  redirect("/admin/site/admins");
}
