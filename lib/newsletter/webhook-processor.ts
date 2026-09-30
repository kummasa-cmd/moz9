import type { WebhookEventPayload } from "resend";
import { planResendWebhookEvent, type SubscriberStatusChange, type WebhookPlan } from "./resend-webhooks";
import { redactSecrets } from "./resend-broadcasts";

// Applies a verified Resend webhook event to Supabase (4단계). Storage is
// injected (see webhook-store.ts for the Supabase implementation) so the
// idempotency and retry rules are unit-tested without a database.
//
// Idempotency, two layers:
//   1. newsletter_webhook_events.svix_id is unique. A redelivered event that
//      was already PROCESSED / IGNORED is answered 200 without doing anything.
//   2. Every effect is itself idempotent (the opt-out SQL function only moves
//      a SUBSCRIBED row and upserts the suppression), and stats are *derived*
//      from PROCESSED event rows
//      rather than incremented. So re-running an event whose earlier attempt
//      failed half-way can't double-apply or double-count anything.
//
// HTTP mapping (Resend/Svix retries every non-2xx with backoff):
//   200 processed / ignored / duplicate
//   409 the same event is being processed right now — retry later
//   500 transient failure (DB) — event marked FAILED, the retry re-claims it

export type SuppressionReason = "UNSUBSCRIBE" | "COMPLAINT" | "BOUNCE";

export type ClaimResult =
  | { state: "claimed"; eventId: string }
  | { state: "done"; status: "PROCESSED" | "IGNORED" }
  | { state: "in_progress" };

export type SubscriberChangeResult = {
  outcome: "updated" | "already" | "stale" | "not_found";
  subscriberId: string | null;
};

export type CompleteInput = {
  status: "PROCESSED" | "IGNORED";
  outcome: string;
  broadcastId: string | null;
  emailId: string | null;
  broadcastSendId: string | null;
  subscriberId: string | null;
  metadata: Record<string, string>;
};

export type WebhookStore = {
  claim(input: { svixId: string; eventType: string; eventCreatedAt: string | null }): Promise<ClaimResult>;
  // newsletter_broadcast_sends.id for a Resend broadcast id, or null.
  findBroadcastSend(resendBroadcastId: string): Promise<string | null>;
  // Subscriber status + suppression, atomically (one SQL function call):
  //   updated   — was SUBSCRIBED, now changed; suppression added/upgraded
  //   already   — wasn't SUBSCRIBED; suppression added/upgraded
  //   stale     — Resend-side unsubscribe older than the latest
  //               (re)subscribe: nothing changed
  //   not_found — no subscriber row; complaint / bounce still suppress
  applySubscriberChange(
    change: SubscriberStatusChange,
    context: { eventAt: string | null; contactId: string | null },
  ): Promise<SubscriberChangeResult>;
  complete(eventId: string, input: CompleteInput): Promise<void>;
  fail(eventId: string, error: string): Promise<void>;
};

export type ProcessResult = {
  httpStatus: 200 | 409 | 500;
  result: "processed" | "ignored" | "duplicate" | "in_progress" | "failed";
  outcome?: string;
  // Set when Supabase changed a subscriber that Resend doesn't know about yet
  // (complaint / bounce) — the caller pushes it with the Contact sync.
  resyncSubscriberId?: string;
};

function errorMessage(err: unknown): string {
  const message = redactSecrets(err instanceof Error ? err.message : String(err));
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

export async function processResendWebhook(
  input: { webhookId: string; event: WebhookEventPayload },
  deps: { store: WebhookStore },
): Promise<ProcessResult> {
  const { store } = deps;
  const plan: WebhookPlan = planResendWebhookEvent(input.event);

  let claim: ClaimResult;
  try {
    claim = await store.claim({ svixId: input.webhookId, eventType: plan.eventType, eventCreatedAt: plan.eventCreatedAt });
  } catch (err) {
    console.error("[newsletter] webhook 이벤트 기록 실패:", input.webhookId, errorMessage(err));
    return { httpStatus: 500, result: "failed" };
  }

  if (claim.state === "done") return { httpStatus: 200, result: "duplicate" };
  if (claim.state === "in_progress") return { httpStatus: 409, result: "in_progress" };

  const eventId = claim.eventId;
  try {
    if (plan.kind === "ignore") {
      await store.complete(eventId, {
        status: "IGNORED",
        outcome: plan.reason,
        broadcastId: null,
        emailId: null,
        broadcastSendId: null,
        subscriberId: null,
        metadata: plan.metadata,
      });
      return { httpStatus: 200, result: "ignored", outcome: plan.reason };
    }

    if (plan.kind === "contact_unsubscribed") {
      const changed = await store.applySubscriberChange(plan.change, { eventAt: plan.eventCreatedAt, contactId: plan.contactId });
      const outcome = `subscriber_${changed.outcome}`;
      await store.complete(eventId, {
        status: "PROCESSED",
        outcome,
        broadcastId: null,
        emailId: null,
        broadcastSendId: null,
        subscriberId: changed.subscriberId,
        metadata: plan.metadata,
      });
      return { httpStatus: 200, result: "processed", outcome };
    }

    // broadcast_email
    const broadcastSendId = await store.findBroadcastSend(plan.broadcastId);
    if (!broadcastSendId) {
      // Not a 검레터 run (e.g. a manual test Broadcast or another product's
      // Broadcast): keep the ids for diagnosis, change nothing.
      await store.complete(eventId, {
        status: "IGNORED",
        outcome: "broadcast_not_linked",
        broadcastId: plan.broadcastId,
        emailId: plan.emailId,
        broadcastSendId: null,
        subscriberId: null,
        metadata: plan.metadata,
      });
      return { httpStatus: 200, result: "ignored", outcome: "broadcast_not_linked" };
    }

    let subscriberId: string | null = null;
    let outcome = "broadcast_stat";
    let resyncSubscriberId: string | undefined;
    if (plan.change) {
      const changed = await store.applySubscriberChange(plan.change, { eventAt: plan.eventCreatedAt, contactId: null });
      subscriberId = changed.subscriberId;
      outcome = `broadcast_stat+subscriber_${changed.outcome}`;
      if (changed.outcome === "updated" && changed.subscriberId) resyncSubscriberId = changed.subscriberId;
    }

    await store.complete(eventId, {
      status: "PROCESSED",
      outcome,
      broadcastId: plan.broadcastId,
      emailId: plan.emailId,
      broadcastSendId,
      subscriberId,
      metadata: plan.metadata,
    });
    return { httpStatus: 200, result: "processed", outcome, ...(resyncSubscriberId ? { resyncSubscriberId } : {}) };
  } catch (err) {
    const message = errorMessage(err);
    try {
      await store.fail(eventId, message);
    } catch (failErr) {
      // Row stays PROCESSING; the stale-claim timeout lets a later retry in.
      console.error("[newsletter] webhook 실패 상태 기록 실패:", input.webhookId, errorMessage(failErr));
    }
    console.error("[newsletter] webhook 처리 실패:", input.webhookId, plan.eventType, message);
    return { httpStatus: 500, result: "failed" };
  }
}
