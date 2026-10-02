// Pure pieces of the site (re)subscribe path (4단계 보완). Kept free of
// Supabase / Next.js imports so the re-subscribe rules are unit-tested.
//
// The rules themselves live in the SQL function newsletter_subscribe
// (0029, tightened in 0030_newsletter_provider_suppressions.sql):
//   UNSUBSCRIBE suppression        → lifted by an explicit site (re)subscribe
//   COMPLAINT / BOUNCE / PROVIDER_SUPPRESSED suppression,
//   or status BOUNCED / SUPPRESSED → 'blocked': nothing changes

export type SubscribeResult =
  // subscriberId / needsContactSync: lets the caller mirror the result to
  // Resend Contacts afterwards (lib/newsletter/contact-sync.ts).
  // blocked: the address is suppressed for a complaint / hard bounce / Resend
  // account suppression. The
  // caller must not sync (the Contact stays unsubscribed) and must not tell
  // the visitor why.
  | { ok: true; alreadySubscribed: boolean; subscriberId: string | null; needsContactSync: boolean; blocked?: boolean }
  | { ok: false; error: string };

export type SubscribeRpcRow = {
  result: string;
  subscriber_id: string | null;
  needs_contact_sync: boolean;
};

export function mapSubscribeRpcRow(row: SubscribeRpcRow | null | undefined): SubscribeResult {
  switch (row?.result) {
    case "created":
    case "reactivated":
      return { ok: true, alreadySubscribed: false, subscriberId: row.subscriber_id, needsContactSync: !!row.needs_contact_sync && !!row.subscriber_id };
    case "already":
      return { ok: true, alreadySubscribed: true, subscriberId: row.subscriber_id, needsContactSync: !!row.needs_contact_sync && !!row.subscriber_id };
    case "blocked":
      return { ok: true, alreadySubscribed: false, subscriberId: null, needsContactSync: false, blocked: true };
    default:
      return { ok: false, error: "구독 처리 결과를 해석할 수 없습니다." };
  }
}

// PostgREST: function not in the schema cache (PGRST202) / Postgres:
// undefined function (42883) — i.e. migration 0029 isn't applied yet.
export function isMissingFunctionError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202" || error?.code === "42883";
}

export type SubscribeActionResult = { ok: true; alreadySubscribed: boolean } | { ok: false; error: string };

// The server action's logic, with its side effects injected.
export async function runSubscribeAction(
  input: { email: string; name?: string },
  deps: {
    subscribe: (input: { email: string; name?: string; source: "WEBSITE" }) => Promise<SubscribeResult>;
    scheduleContactSync: (subscriberId: string) => void;
    logError?: (...args: unknown[]) => void;
  },
): Promise<SubscribeActionResult> {
  const result = await deps.subscribe({ email: input.email, name: input.name, source: "WEBSITE" });

  if (!result.ok) {
    (deps.logError ?? console.error)("[newsletter] 구독 신청 실패:", result.error);
    return { ok: false, error: "구독 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." };
  }

  // Blocked (complaint / hard bounce): answer exactly like a fresh signup, so
  // the form reveals neither that the address is known nor why it's blocked.
  // No Contact sync — Resend must keep it unsubscribed.
  if (result.blocked) return { ok: true, alreadySubscribed: false };

  // Supabase first, Resend second: the Contact sync runs after the response
  // is sent, so a slow or failing Resend call never fails the subscription
  // (failures are recorded on the row and retried later).
  if (result.subscriberId && result.needsContactSync) deps.scheduleContactSync(result.subscriberId);

  return { ok: true, alreadySubscribed: result.alreadySubscribed };
}
