"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyPassword,
  createAdminSession,
  clearAdminSession,
} from "@/lib/admin-auth";
import { AdminSessionConfigError } from "@/lib/admin-session/config";
import { safeAdminRedirect } from "@/lib/admin-session/redirect";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeAdminRedirect(formData.get("redirect"));

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

  try {
    await createAdminSession(admin.id);
  } catch (error) {
    if (!(error instanceof AdminSessionConfigError)) throw error;
    // Fail closed: no session without a valid ADMIN_SESSION_SIGNING_SECRET.
    // The reason code (never the value) goes to the server log only.
    console.error(`[admin-auth] session not issued: ${error.reason}`);
    const params = new URLSearchParams({
      error: "관리자 로그인을 일시적으로 사용할 수 없습니다. 운영자에게 문의해 주세요.",
      redirect: redirectTo,
    });
    redirect(`/admin/login?${params.toString()}`);
  }
  redirect(redirectTo);
}

export async function logout() {
  await clearAdminSession();
  redirect("/admin/login");
}
