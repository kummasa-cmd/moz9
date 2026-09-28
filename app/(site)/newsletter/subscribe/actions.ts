"use server";

import { subscribe } from "@/lib/newsletter/queries";

// Same shape the form validates client-side (react-hook-form) and the old
// anon-insert RLS policy enforced — see 0025_security_advisor_fixes.sql.
const EMAIL_PATTERN = /^\S+@\S+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

export type SubscribeActionResult =
  | { ok: true; alreadySubscribed: boolean }
  | { ok: false; error: string };

// Server-side replacement for the old browser-side anon insert, so a
// returning (previously unsubscribed) email is re-subscribed instead of
// failing on the unique constraint — see lib/newsletter/queries.ts::subscribe.
export async function subscribeToNewsletter(input: {
  email: string;
  name?: string;
}): Promise<SubscribeActionResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, MAX_NAME_LENGTH);

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "올바른 이메일을 입력해 주세요." };
  }

  const result = await subscribe({ email, name: name || undefined, source: "WEBSITE" });

  if (!result.ok) {
    console.error("[newsletter] 구독 신청 실패:", result.error);
    return { ok: false, error: "구독 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  return result;
}
