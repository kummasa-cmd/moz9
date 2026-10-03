"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTestEmail } from "@/lib/newsletter/test-send";

// Test recipients (newsletter_test_recipients, 0032). A separate list from
// newsletter_subscribers: nothing here touches subscribers, suppressions or
// Resend Contacts.

const PAGE = "/admin/site/newsletter/subscribers";

function back(params: Record<string, string>): never {
  redirect(`${PAGE}?${new URLSearchParams(params).toString()}#test-recipients`);
}

export async function addTestRecipient(formData: FormData) {
  const email = normalizeTestEmail(String(formData.get("email") ?? ""));
  const name = String(formData.get("name") ?? "").trim() || null;
  const memo = String(formData.get("memo") ?? "").trim() || null;
  if (!email) back({ test_error: "올바른 이메일을 입력해 주세요." });

  const { error } = await createAdminClient().from("newsletter_test_recipients").insert({ email, name, memo });
  if (error) back({ test_error: error.code === "23505" ? "이미 등록된 테스트 계정입니다." : error.message });

  revalidatePath(PAGE);
  back({ test_notice: "테스트 계정을 등록했습니다." });
}

export async function setTestRecipientActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) back({ test_error: "대상을 찾을 수 없습니다." });

  const { error } = await createAdminClient().from("newsletter_test_recipients").update({ active }).eq("id", id);
  if (error) back({ test_error: error.message });

  revalidatePath(PAGE);
  back({ test_notice: active ? "테스트 계정을 활성화했습니다." : "테스트 계정을 비활성화했습니다." });
}

export async function deleteTestRecipient(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) back({ test_error: "대상을 찾을 수 없습니다." });

  const { error } = await createAdminClient().from("newsletter_test_recipients").delete().eq("id", id);
  if (error) back({ test_error: error.message });

  revalidatePath(PAGE);
  back({ test_notice: "테스트 계정을 삭제했습니다." });
}
