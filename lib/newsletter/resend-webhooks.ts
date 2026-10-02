import { Resend, type WebhookEventPayload } from "resend";
import { parseProviderOrigin, sanitizeProviderToken, type ProviderSuppressionCheck } from "./resend-suppressions";

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
//   - Resend account suppression (Stage 4.5): email.suppressed (any mail —
//     legacy, service or Broadcast) and suppression.added. Suppression is a
//     fact about the *address*, whichever mail hit it, so the processor
//     re-checks the address against the Resend suppression list and applies
//     the classification to the matching subscriber, if any
//     (resend-suppressions.ts / newsletter_apply_provider_suppression).
//     suppression.removed is recorded only — never an automatic re-subscribe.
// Everything else is recorded and ignored. In particular other email.*
// events without a broadcast_id are ignored: service mail (lib/mail.ts) uses
// the same sender address as the legacy newsletter, so there is no safe way
// to tell a legacy newsletter email from a transactional one. Their email_id
// and bounce / suppressed type are still kept for diagnosis.
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

export type IgnoreReason =
  | "not_newsletter"
  | "unsupported_type"
  | "contact_not_unsubscribed"
  | "missing_data"
  | "suppression_removed";

export type WebhookPlan = {
  eventType: string;
  eventCreatedAt: string | null;
  metadata: Record<string, string>;
} & (
  // emailId: Resend's id of the email when the event has one — kept for
  // diagnosis (it is not an address).
  | { kind: "ignore"; reason: IgnoreReason; emailId?: string | null }
  | { kind: "contact_unsubscribed"; contactId: string | null; change: SubscriberStatusChange }
  | {
      kind: "broadcast_email";
      broadcastId: string;
      emailId: string;
      // Applied only if the broadcast turns out to be a 검레터 run.
      change: SubscriberStatusChange | null;
      // email.suppressed: the address is re-checked whether or not the
      // broadcast is linked.
      providerCheck: ProviderSuppressionCheck | null;
    }
  | { kind: "provider_suppression"; emailId: string | null; check: ProviderSuppressionCheck }
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

  // Not part of the SDK's WebhookEventPayload union (resend ^6.18).
  const eventType: string = event.type;
  if (eventType === "suppression.added" || eventType === "suppression.removed") {
    return planSuppressionEvent(eventType, base, (event as { data?: unknown }).data);
  }

  if (!EMAIL_EVENT_TYPES.has(event.type)) {
    return { ...base, metadata: {}, kind: "ignore", reason: "unsupported_type" };
  }

  const data = event.data as { broadcast_id?: unknown; email_id?: unknown; to?: unknown };
  const broadcastId = typeof data.broadcast_id === "string" && data.broadcast_id ? data.broadcast_id : null;
  const emailId = sanitizeResendId(data.email_id);
  const recipient = normalizeEmail(Array.isArray(data.to) ? data.to[0] : undefined);

  // Ids and classification tokens only — never addresses or message text.
  const metadata: Record<string, string> = {};
  let bounceType: string | null = null;
  if (event.type === "email.bounced") {
    bounceType = sanitizeProviderToken(event.data.bounce?.type);
    const subType = sanitizeProviderToken(event.data.bounce?.subType);
    if (bounceType) metadata.bounce_type = bounceType;
    if (subType) metadata.bounce_sub_type = subType;
  } else if (event.type === "email.suppressed") {
    const suppressedType = sanitizeProviderToken(event.data.suppressed?.type);
    if (suppressedType) metadata.suppressed_type = suppressedType;
  }

  const providerCheck: ProviderSuppressionCheck | null =
    event.type === "email.suppressed" && recipient
      ? { trigger: "email.suppressed", email: recipient, suppressionId: null, origin: null, sourceEmailId: null }
      : null;

  if (!broadcastId) {
    if (providerCheck) return { ...base, metadata, kind: "provider_suppression", emailId, check: providerCheck };
    // No broadcast id: legacy newsletter or service mail — not
    // distinguishable, so neither is touched.
    const reason: IgnoreReason = event.type === "email.suppressed" ? "missing_data" : "not_newsletter";
    return { ...base, metadata, kind: "ignore", reason, emailId };
  }

  if (!emailId) return { ...base, metadata, kind: "ignore", reason: "missing_data" };

  let change: SubscriberStatusChange | null = null;
  if (event.type === "email.bounced") {
    // Only a Permanent bounce (hard bounce) takes the address out for good.
    // Transient / Undetermined bounces are stats only.
    if (recipient && bounceType?.toLowerCase() === "permanent") {
      change = { status: "BOUNCED", reason: "permanent_bounce", email: recipient };
    }
  } else if (event.type === "email.complained") {
    if (recipient) change = { status: "UNSUBSCRIBED", reason: "complaint", email: recipient };
  } else if (event.type === "email.clicked") {
    const link = sanitizeLink(event.data.click?.link);
    if (link) metadata.link = link;
  }

  return { ...base, metadata, kind: "broadcast_email", broadcastId, emailId, change, providerCheck };
}

// suppression.added / suppression.removed:
//   data: { id, email, origin: bounce | complaint | manual, source_id, created_at }
function planSuppressionEvent(
  eventType: "suppression.added" | "suppression.removed",
  base: { eventType: string; eventCreatedAt: string | null },
  data: unknown,
): WebhookPlan {
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const suppressionId = sanitizeResendId(d.id);
  const origin = parseProviderOrigin(d.origin);
  const sourceEmailId = sanitizeResendId(d.source_id);

  const metadata: Record<string, string> = {};
  if (suppressionId) metadata.suppression_id = suppressionId;
  if (origin) metadata.origin = origin;
  if (sourceEmailId) metadata.source_email_id = sourceEmailId;

  // Recorded only: leaving Resend's list never re-subscribes anyone.
  if (eventType === "suppression.removed") return { ...base, metadata, kind: "ignore", reason: "suppression_removed" };

  const email = normalizeEmail(d.email);
  if (!email) return { ...base, metadata, kind: "ignore", reason: "missing_data" };
  return {
    ...base,
    metadata,
    kind: "provider_suppression",
    emailId: null,
    check: { trigger: "suppression.added", email, suppressionId, origin, sourceEmailId },
  };
}

function sanitizeResendId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[A-Za-z0-9_-]{1,100}$/.test(id) ? id : null;
}

// Log-safe summary (no addresses, no links).
export function describeWebhookPlan(plan: WebhookPlan): string {
  const parts = [plan.eventType, plan.kind];
  if (plan.kind === "ignore") parts.push(plan.reason);
  if (plan.kind === "broadcast_email") parts.push(`broadcast=${plan.broadcastId}`);
  if (plan.kind === "provider_suppression" || (plan.kind === "broadcast_email" && plan.providerCheck)) {
    parts.push("provider_check");
  }
  const change = plan.kind === "contact_unsubscribed" || plan.kind === "broadcast_email" ? plan.change : null;
  if (change) parts.push(`subscriber→${change.status}(${change.reason})`);
  return parts.join(" ");
}
