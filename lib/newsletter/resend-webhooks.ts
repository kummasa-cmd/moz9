import { Resend, type WebhookEventPayload } from "resend";

// Resend webhook handling (3단계: 검증 + 분류만, DB 반영은 4단계).
//
// verifyResendWebhook checks the Svix signature with RESEND_WEBHOOK_SECRET
// through the official SDK (resend.webhooks.verify → standardwebhooks, which
// also rejects timestamps older than 5 minutes = replay protection).
// classifyResendWebhookEvent turns a verified event into the Supabase change
// 4단계 will apply; the Stage 3 route only acknowledges it.
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
  // the dedupe key for 4단계.
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

export type BroadcastEmailEvent =
  | "sent"
  | "delivered"
  | "delivery_delayed"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "failed"
  | "suppressed"
  | "scheduled";

export type SubscriberStatusChange = {
  // BOUNCED for a permanent bounce, UNSUBSCRIBED otherwise. 4단계 also adds
  // the address to newsletter_suppressions, like unsubscribeByToken does.
  status: "BOUNCED" | "UNSUBSCRIBED";
  reason: "permanent_bounce" | "complaint" | "resend_unsubscribe";
  // Lower-cased. Only for the DB lookup — never log it.
  email: string;
};

export type WebhookAction = {
  type: string;
  // email.* events that belong to a Broadcast → newsletter_broadcast_sends
  // (resend_broadcast_id) for per-run stats.
  broadcast: { broadcastId: string; event: BroadcastEmailEvent; emailId: string; link?: string } | null;
  // Changes Supabase must mirror so the legacy path and the Contact sync
  // agree with Resend.
  subscriber: SubscriberStatusChange | null;
};

const EMAIL_EVENTS: Record<string, BroadcastEmailEvent> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
  "email.scheduled": "scheduled",
};

export function classifyResendWebhookEvent(event: WebhookEventPayload): WebhookAction {
  const action: WebhookAction = { type: event.type, broadcast: null, subscriber: null };

  if (event.type === "contact.updated" || event.type === "contact.created") {
    // An unsubscribe through Resend's link (Broadcast footer or the
    // List-Unsubscribe header) only changes the Resend Contact — Supabase
    // must follow or the legacy path would keep mailing the address.
    if (event.data.unsubscribed && event.data.email) {
      action.subscriber = { status: "UNSUBSCRIBED", reason: "resend_unsubscribe", email: event.data.email.trim().toLowerCase() };
    }
    return action;
  }

  const emailEvent = EMAIL_EVENTS[event.type];
  if (!emailEvent) return action;

  const data = event.data as { broadcast_id?: string; email_id: string; to?: string[] };
  if (data.broadcast_id) {
    action.broadcast = {
      broadcastId: data.broadcast_id,
      event: emailEvent,
      emailId: data.email_id,
      ...(event.type === "email.clicked" ? { link: event.data.click.link } : {}),
    };
  }

  const recipient = data.to?.[0]?.trim().toLowerCase();
  if (recipient) {
    if (event.type === "email.bounced" && event.data.bounce?.type?.toLowerCase() === "permanent") {
      action.subscriber = { status: "BOUNCED", reason: "permanent_bounce", email: recipient };
    } else if (event.type === "email.complained") {
      action.subscriber = { status: "UNSUBSCRIBED", reason: "complaint", email: recipient };
    }
  }

  return action;
}

// Log-safe summary (no addresses, no links).
export function describeWebhookAction(action: WebhookAction): string {
  const parts = [action.type];
  if (action.broadcast) parts.push(`broadcast=${action.broadcast.broadcastId}`, `event=${action.broadcast.event}`);
  if (action.subscriber) parts.push(`subscriber→${action.subscriber.status}(${action.subscriber.reason})`);
  return parts.join(" ");
}
