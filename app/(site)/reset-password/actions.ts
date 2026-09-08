"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function resetPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");

  if (password.length < 6) {
    redirect("/reset-password?error=비밀번호는 6자 이상이어야 합니다.");
  }

  if (password !== passwordConfirm) {
    redirect("/reset-password?error=비밀번호가 일치하지 않습니다.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/forgot-password?error=인증이 만료되었습니다. 다시 요청해 주세요.");
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.signOut();
  redirect("/login?next=/mypage&reset=1");
}
