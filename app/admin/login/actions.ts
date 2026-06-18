"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyPassword,
  createAdminSession,
  clearAdminSession,
} from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirect") || "/admin");

  const supabase = createAdminClient();
  const { data: admin } = await supabase
    .from("admins")
    .select("id, password_hash")
    .eq("email", email)
    .maybeSingle();

  if (!admin || !(await verifyPassword(password, admin.password_hash))) {
    const params = new URLSearchParams({
      error: "이메일 또는 비밀번호가 올바르지 않습니다.",
      redirect: redirectTo,
    });
    redirect(`/admin/login?${params.toString()}`);
  }

  await createAdminSession(admin.id);
  redirect(redirectTo);
}

export async function logout() {
  await clearAdminSession();
  redirect("/admin/login");
}
