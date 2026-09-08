"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type FindEmailState = {
  error?: string;
  email?: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

export async function findMemberEmail(
  _prevState: FindEmailState,
  formData: FormData
): Promise<FindEmailState> {
  const name = String(formData.get("name") ?? "").trim();
  const phoneDigits = onlyDigits(String(formData.get("phone") ?? ""));

  if (!name || !phoneDigits) {
    return { error: "이름과 전화번호를 모두 입력해 주세요." };
  }

  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from("members")
    .select("email, phone, status")
    .eq("name", name);

  if (error) {
    return { error: "조회 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  const matched = members?.find(
    (m) => m.phone && onlyDigits(m.phone) === phoneDigits && m.status !== "탈퇴"
  );

  if (!matched) {
    return { error: "일치하는 회원 정보를 찾을 수 없습니다." };
  }

  return { email: maskEmail(matched.email) };
}
