"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(formData: FormData) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) redirect("/mypage/profile?error=닉네임을 입력해 주세요.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/profile");

  const { error } = await supabase
    .from("members")
    .update({ nickname, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    redirect(`/mypage/profile?error=${encodeURIComponent(error.message)}`);
  }

  // Sync nickname to user metadata
  await supabase.auth.updateUser({ data: { nickname } });

  revalidatePath("/mypage", "layout");
  redirect("/mypage/profile?success=1");
}

export async function updatePassword(formData: FormData) {
  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (next.length < 6) redirect("/mypage/profile?error=새 비밀번호는 6자 이상이어야 합니다.#password");
  if (next !== confirm) redirect("/mypage/profile?error=새 비밀번호가 일치하지 않습니다.#password");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verify current password
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email!,
    password: current,
  });
  if (signInError) redirect("/mypage/profile?error=현재 비밀번호가 올바르지 않습니다.#password");

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) redirect(`/mypage/profile?error=${encodeURIComponent(error.message)}#password`);

  redirect("/mypage/profile?success=2");
}
