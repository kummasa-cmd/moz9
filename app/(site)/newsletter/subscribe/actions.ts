"use server";

import { after } from "next/server";
import { subscribe } from "@/lib/newsletter/queries";
import { syncSubscriberContact } from "@/lib/newsletter/contact-sync";
import { runSubscribeAction, type SubscribeActionResult } from "@/lib/newsletter/subscribe-flow";

// Same shape the form validates client-side (react-hook-form) and the old
// anon-insert RLS policy enforced — see 0025_security_advisor_fixes.sql.
const EMAIL_PATTERN = /^\S+@\S+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 100;

// Server-side replacement for the old browser-side anon insert, so a
// returning (previously unsubscribed) email is re-subscribed instead of
// failing on the unique constraint — see lib/newsletter/queries.ts::subscribe
// and lib/newsletter/subscribe-flow.ts for the re-subscribe rules.
export async function subscribeToNewsletter(input: {
  email: string;
  name?: string;
}): Promise<SubscribeActionResult> {
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim().slice(0, MAX_NAME_LENGTH);

  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "올바른 이메일을 입력해 주세요." };
  }

  return runSubscribeAction(
    { email, name: name || undefined },
    { subscribe, scheduleContactSync: (subscriberId) => after(() => syncSubscriberContact(subscriberId)) },
  );
}
