"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/mypage");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent("이메일 또는 비밀번호가 올바르지 않습니다.")}&next=${encodeURIComponent(next)}`);
  }

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("id, status")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!member) {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("회원 정보를 찾을 수 없습니다. 회원가입을 먼저 진행해 주세요.")}&next=${encodeURIComponent(next)}`);
  }

  if (member.status === "탈퇴") {
    await supabase.auth.signOut();
    redirect(`/login?error=${encodeURIComponent("탈퇴한 회원입니다. 관리자에게 문의해 주세요.")}&next=${encodeURIComponent(next)}`);
  }

  revalidatePath("/", "layout");
  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
