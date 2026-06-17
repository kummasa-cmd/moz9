"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function register(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nickname = String(formData.get("nickname") ?? "").trim();

  if (!nickname) redirect("/register?error=닉네임을 입력해 주세요.");
  if (password.length < 6) redirect("/register?error=비밀번호는 6자 이상이어야 합니다.");

  const supabase = await createClient();

  // Create Supabase Auth user (stores nickname in user_metadata)
  const { data, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nickname } },
  });

  if (signUpError) {
    redirect(`/register?error=${encodeURIComponent(signUpError.message)}`);
  }

  if (!data.user) {
    redirect("/register?error=회원가입에 실패했습니다. 다시 시도해 주세요.");
  }

  // Insert profile into members table using admin client (bypasses RLS)
  const admin = createAdminClient();
  const { error: insertError } = await admin.from("members").insert({
    user_id: data.user.id,
    name: nickname,
    email,
    nickname,
    grade: "일반",
    status: "정상",
  });

  if (insertError && !insertError.message.includes("duplicate")) {
    redirect(`/register?error=${encodeURIComponent(insertError.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/mypage");
}
