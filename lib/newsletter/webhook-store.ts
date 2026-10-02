import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubscriberStatusChange } from "./resend-webhooks";
import type { ClaimResult, CompleteInput, SubscriberChangeResult, SuppressionReason, WebhookStore } from "./webhook-processor";
import { applyProviderSuppressionRpc } from "./suppression-reconcile";

// Supabase side of webhook-processor.ts (4단계). Every method either succeeds
// or throws; the processor turns a throw into FAILED + HTTP 500 so Resend
// retries. Nothing here logs email addresses.

const UNIQUE_VIOLATION = "23505";

// A PROCESSING row older than this is treated as abandoned (the request that
// claimed it died) and may be re-claimed by a retry. Longer than the
// function timeout so a slow-but-alive request is never overtaken.
export const STALE_CLAIM_MS = 10 * 60 * 1000;

export const SUPPRESSION_REASON: Record<SubscriberStatusChange["reason"], SuppressionReason> = {
  resend_unsubscribe: "UNSUBSCRIBE",
  complaint: "COMPLAINT",
  permanent_bounce: "BOUNCE",
};

const OUTCOMES = new Set<SubscriberChangeResult["outcome"]>(["updated", "already", "stale", "not_found"]);

export function createWebhookStore(db: SupabaseClient, now: () => Date = () => new Date()): WebhookStore {
  const events = () => db.from("newsletter_webhook_events");

  return {
    async claim({ svixId, eventType, eventCreatedAt }): Promise<ClaimResult> {
      const { data, error } = await events()
        .insert({ svix_id: svixId, event_type: eventType, event_created_at: eventCreatedAt, status: "PROCESSING" })
        .select("id")
        .single();
      if (!error) return { state: "claimed", eventId: data.id as string };
      if (error.code !== UNIQUE_VIOLATION) throw new Error(`webhook 이벤트 생성 실패: ${error.message}`);

      const { data: existing, error: loadError } = await events()
        .select("id, status, processing_started_at, attempts")
        .eq("svix_id", svixId)
        .single();
      if (loadError) throw new Error(`webhook 이벤트 조회 실패: ${loadError.message}`);

      const status = existing.status as string;
      if (status === "PROCESSED" || status === "IGNORED") return { state: "done", status };

      const startedAt = new Date(existing.processing_started_at as string).getTime();
      const reclaimable = status === "FAILED" || (status === "PROCESSING" && now().getTime() - startedAt > STALE_CLAIM_MS);
      if (!reclaimable) return { state: "in_progress" };

      // Optimistic: only wins if nobody re-claimed it in between.
      const { data: reclaimed, error: reclaimError } = await events()
        .update({
          status: "PROCESSING",
          processing_started_at: now().toISOString(),
          attempts: ((existing.attempts as number) ?? 1) + 1,
          error: null,
        })
        .eq("id", existing.id)
        .eq("status", status)
        .eq("processing_started_at", existing.processing_started_at)
        .select("id")
        .maybeSingle();
      if (reclaimError) throw new Error(`webhook 이벤트 재처리 준비 실패: ${reclaimError.message}`);
      return reclaimed ? { state: "claimed", eventId: existing.id as string } : { state: "in_progress" };
    },

    async findBroadcastSend(resendBroadcastId) {
      const { data, error } = await db
        .from("newsletter_broadcast_sends")
        .select("id")
        .eq("resend_broadcast_id", resendBroadcastId)
        .maybeSingle();
      if (error) throw new Error(`Broadcast 실행 기록 조회 실패: ${error.message}`);
      return (data?.id as string | undefined) ?? null;
    },

    // Status change + suppression in one transaction under a row lock — see
    // newsletter_apply_resend_opt_out in 0029 for the rules (stale check for
    // Resend-side unsubscribes only; complaints / bounces always apply).
    async applySubscriberChange(change: SubscriberStatusChange, context): Promise<SubscriberChangeResult> {
      const { data, error } = await db.rpc("newsletter_apply_resend_opt_out", {
        p_email: change.email,
        p_status: change.status,
        p_reason: SUPPRESSION_REASON[change.reason],
        p_event_at: context.eventAt,
        p_contact_id: context.contactId,
      });
      if (error) throw new Error(`구독자 수신거부 반영 실패: ${error.message}`);

      const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; subscriber_id?: string | null } | null;
      const outcome = row?.outcome as SubscriberChangeResult["outcome"] | undefined;
      if (!outcome || !OUTCOMES.has(outcome)) throw new Error("구독자 수신거부 반영 결과를 해석할 수 없습니다.");
      return { outcome, subscriberId: row?.subscriber_id ?? null };
    },

    // Resend account suppression — newsletter_apply_provider_suppression (0030).
    applyProviderSuppression: (input) => applyProviderSuppressionRpc(db, input),

    async complete(eventId, input: CompleteInput) {
      const { error } = await events()
        .update({
          status: input.status,
          outcome: input.outcome,
          processed_at: now().toISOString(),
          error: null,
          resend_broadcast_id: input.broadcastId,
          email_id: input.emailId,
          broadcast_send_id: input.broadcastSendId,
          subscriber_id: input.subscriberId,
          metadata: input.metadata,
        })
        .eq("id", eventId);
      if (error) throw new Error(`webhook 이벤트 완료 기록 실패: ${error.message}`);
    },

    async fail(eventId, message) {
      const { error } = await events().update({ status: "FAILED", error: message }).eq("id", eventId);
      if (error) throw new Error(error.message);
    },
  };
}
