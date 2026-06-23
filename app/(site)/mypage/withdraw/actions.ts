"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function withdrawMember(formData: FormData) {
  const reason = String(formData.get("reason") ?? "").trim();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  const { data: member } = await admin
    .from("members")
    .select("name, nickname")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member) redirect("/mypage?error=회원 정보를 찾을 수 없습니다.");

  const now = new Date().toISOString();

  const { error: insertError } = await admin.from("members_out").insert({
    name: member.name,
    nickname: member.nickname,
    reason: reason || null,
    withdrawn_at: now,
  });

  if (insertError) {
    redirect(
      `/mypage/withdraw?error=${encodeURIComponent(insertError.message)}`
    );
  }

  const { error: deleteError } = await admin
    .from("members")
    .delete()
    .eq("user_id", user.id);

  if (deleteError) {
    redirect(
      `/mypage/withdraw?error=${encodeURIComponent(deleteError.message)}`
    );
  }

  await admin.auth.admin.deleteUser(user.id);

  await supabase.auth.signOut();
  redirect("/?withdrawn=1");
}
