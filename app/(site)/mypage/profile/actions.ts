"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const PARTNER_PRODUCTS = ["LIGHT", "BASIC", "STANDARD", "PREMIUM"];

export async function updateProfile(formData: FormData) {
  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) redirect("/mypage/profile?error=닉네임을 입력해 주세요.");

  const avatar_url = String(formData.get("avatar_url") ?? "").trim() || null;
  const homepage = String(formData.get("homepage") ?? "").trim() || null;
  const bio =
    String(formData.get("bio") ?? "")
      .trim()
      .split("\n")
      .slice(0, 5)
      .join("\n") || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/profile");

  const admin = createAdminClient();
  const { error } = await admin
    .from("members")
    .update({ nickname, avatar_url, homepage, bio, updated_at: new Date().toISOString() })
    .eq("user_id", user.id);

  if (error) {
    redirect(`/mypage/profile?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.auth.updateUser({ data: { nickname } });

  revalidatePath("/mypage", "layout");
  redirect("/mypage/profile?success=1");
}

export async function updatePartnerProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/profile");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("is_partner")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_partner) redirect("/mypage/profile");

  const partner_name = String(formData.get("partner_name") ?? "").trim() || null;
  const partner_homepage = String(formData.get("partner_homepage") ?? "").trim() || null;
  const partner_address = String(formData.get("partner_address") ?? "").trim() || null;
  const partner_phone = String(formData.get("partner_phone") ?? "").trim() || null;
  const partner_product_raw = String(formData.get("partner_product") ?? "");
  const partner_product = PARTNER_PRODUCTS.includes(partner_product_raw) ? partner_product_raw : null;
  const partner_contract_start = String(formData.get("partner_contract_start") ?? "") || null;
  const partner_contract_end = String(formData.get("partner_contract_end") ?? "") || null;
  const partner_note = String(formData.get("partner_note") ?? "").trim() || null;
  const partner_active = formData.get("partner_active") === "on";

  const { error } = await admin
    .from("members")
    .update({
      partner_name,
      partner_homepage,
      partner_address,
      partner_phone,
      partner_product,
      partner_contract_start,
      partner_contract_end,
      partner_note,
      partner_active,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (error) {
    redirect(`/mypage/profile?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mypage/profile");
  redirect("/mypage/profile?success=3");
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
