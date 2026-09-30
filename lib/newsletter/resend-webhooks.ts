import { Resend, type WebhookEventPayload } from "resend";

// Resend webhook: signature check + event planning (4단계).
//
// verifyResendWebhook checks the Svix signature with RESEND_WEBHOOK_SECRET
// through the official SDK (resend.webhooks.verify → standardwebhooks, which
// also rejects timestamps more than 5 minutes off = replay protection).
// planResendWebhookEvent turns a verified event into what we may do with it;
// webhook-processor.ts applies the plan to Supabase.
//
// Which events may change newsletter data:
//   - contact.* with unsubscribed=true — a Resend-side opt-out (Broadcast
//     unsubscribe link / List-Unsubscribe). Contacts only mirror
//     newsletter_subscribers, so this is newsletter data by definition.
//   - email.* carrying a broadcast_id — but only once the processor has
//     matched it to a 검레터 run in newsletter_broadcast_sends.
// Everything else is recorded and ignored. In particular email.* events
// without a broadcast_id are ignored: service mail (lib/mail.ts) uses the
// same sender address as the legacy newsletter, so there is no safe way to
// tell a legacy newsletter email from a transactional one.
//
// Kept free of Supabase / Next.js imports so it can be unit-tested.

export type WebhookSignatureHeaders = { id: string; timestamp: string; signature: string };

export type WebhookVerifier = (input: {
  payload: string;
  headers: WebhookSignatureHeaders;
  webhookSecret: string;
}) => WebhookEventPayload;

// webhooks.verify is a local HMAC check and makes no API call, but the SDK
// constructor insists on a key — a placeholder keeps the endpoint independent
// of RESEND_API_KEY.
const sdkVerifier: WebhookVerifier = (input) => new Resend("re_webhook_verify_only").webhooks.verify(input);

export type VerifyResult =
  // webhookId (svix-id) is the same across Resend's retries of one event —
  // the idempotency key.
  | { ok: true; webhookId: string; event: WebhookEventPayload }
  | { ok: false; status: 400 | 401 | 503; error: string };

type HeaderSource = { get(name: string): string | null };

export function verifyResendWebhook(
  rawBody: string,
  headers: HeaderSource,
  secret: string | undefined,
  verifier: WebhookVerifier = sdkVerifier,
): VerifyResult {
  if (!secret?.trim()) return { ok: false, status: 503, error: "webhook not configured" };

  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signature = headers.get("svix-signature");
  if (!id || !timestamp || !signature) return { ok: false, status: 400, error: "missing signature headers" };

  try {
    const event = verifier({ payload: rawBody, headers: { id, timestamp, signature }, webhookSecret: secret.trim() });
    return { ok: true, webhookId: id, event };
  } catch {
    // Never echo the reason — it can include parts of the signature.
    return { ok: false, status: 401, error: "invalid signature" };
  }
}

export type SubscriberStatusChange = {
  status: "BOUNCED" | "UNSUBSCRIBED";
  reason: "permanent_bounce" | "complaint" | "resend_unsubscribe";
  // Lower-cased. Only for the DB lookup — never logged or stored on the event.
  email: string;
};

export type IgnoreReason = "not_newsletter" | "unsupported_type" | "contact_not_unsubscribed" | "missing_data";

export type WebhookPlan = {
  eventType: string;
  eventCreatedAt: string | null;
  metadata: Record<string, string>;
} & (
  | { kind: "ignore"; reason: IgnoreReason }
  | { kind: "contact_unsubscribed"; contactId: string | null; change: SubscriberStatusChange }
  | {
      kind: "broadcast_email";
      broadcastId: string;
      emailId: string;
      // Applied only if the broadcast turns out to be a 검레터 run.
      change: SubscriberStatusChange | null;
    }
);

const EMAIL_EVENT_TYPES = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
  "email.scheduled",
]);

// Keeps origin + path only: query strings can carry per-recipient tokens.
export function sanitizeLink(link: string | undefined): string | null {
  if (!link) return null;
  try {
    const url = new URL(link);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const clean = `${url.origin}${url.pathname}`;
    return clean.length > 500 ? clean.slice(0, 500) : clean;
  } catch {
    return null;
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.includes("@") ? email : null;
}

export function planResendWebhookEvent(event: WebhookEventPayload): WebhookPlan {
  const base = {
    eventType: event.type,
    eventCreatedAt: typeof event.created_at === "string" ? event.created_at : null,
  };

  if (event.type === "contact.updated" || event.type === "contact.created") {
    const contactId = typeof event.data?.id === "string" ? event.data.id : null;
    const metadata: Record<string, string> = contactId ? { contact_id: contactId } : {};
    if (event.data?.unsubscribed !== true) {
      return { ...base, metadata, kind: "ignore", reason: "contact_not_unsubscribed" };
    }
    const email = normalizeEmail(event.data.email);
    if (!email) return { ...base, metadata, kind: "ignore", reason: "missing_data" };
    return {
      ...base,
      metadata,
      kind: "contact_unsubscribed",
      contactId,
      change: { status: "UNSUBSCRIBED", reason: "resend_unsubscribe", email },
    };
  }

  if (!EMAIL_EVENT_TYPES.has(event.type)) {
    return { ...base, metadata: {}, kind: "ignore", reason: "unsupported_type" };
  }

  const data = event.data as { broadcast_id?: unknown; email_id?: unknown; to?: unknown };
  const broadcastId = typeof data.broadcast_id === "string" && data.broadcast_id ? data.broadcast_id : null;
  // No broadcast id: legacy newsletter or service mail — not distinguishable,
  // so neither is touched.
  if (!broadcastId) return { ...base, metadata: {}, kind: "ignore", reason: "not_newsletter" };

  const emailId = typeof data.email_id === "string" && data.email_id ? data.email_id : null;
  if (!emailId) return { ...base, metadata: {}, kind: "ignore", reason: "missing_data" };

  const metadata: Record<string, string> = {};
  let change: SubscriberStatusChange | null = null;
  const recipient = normalizeEmail(Array.isArray(data.to) ? data.to[0] : undefined);

  if (event.type === "email.bounced") {
    const bounce = event.data.bounce ?? { type: "", subType: "" };
    if (bounce.type) metadata.bounce_type = String(bounce.type);
    if (bounce.subType) metadata.bounce_sub_type = String(bounce.subType);
    // Only a Permanent bounce (hard bounce) takes the address out for good.
    // Transient / Undetermined bounces are stats only.
    if (recipient && String(bounce.type).toLowerCase() === "permanent") {
      change = { status: "BOUNCED", reason: "permanent_bounce", email: recipient };
    }
  } else if (event.type === "email.complained") {
    if (recipient) change = { status: "UNSUBSCRIBED", reason: "complaint", email: recipient };
  } else if (event.type === "email.clicked") {
    const link = sanitizeLink(event.data.click?.link);
    if (link) metadata.link = link;
  }

  return { ...base, metadata, kind: "broadcast_email", broadcastId, emailId, change };
}

// Log-safe summary (no addresses, no links).
export function describeWebhookPlan(plan: WebhookPlan): string {
  const parts = [plan.eventType, plan.kind];
  if (plan.kind === "ignore") parts.push(plan.reason);
  if (plan.kind === "broadcast_email") parts.push(`broadcast=${plan.broadcastId}`);
  const change = plan.kind === "ignore" ? null : plan.change;
  if (change) parts.push(`subscriber→${change.status}(${change.reason})`);
  return parts.join(" ");
}
