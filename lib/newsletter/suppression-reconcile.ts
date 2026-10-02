import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "./paginate";
import { redactSecrets } from "./resend-broadcasts";
import {
  PROVIDER_REASON_STATUS,
  classifyAccountSuppression,
  listAccountSuppressions,
  suppressionRank,
  type AccountSuppression,
  type ClassificationBasis,
  type ProviderSuppressionReason,
  type SuppressionClassification,
  type SuppressionLookupClient,
} from "./resend-suppressions";
import type { RetryOptions } from "./resend-contacts";

// Resend account suppression → Supabase reconciliation (Stage 4.5).
//
// Reads the whole account suppression list, matches it against
// newsletter_subscribers, classifies each match (resend-suppressions.ts) and
// applies it through newsletter_apply_provider_suppression (0030):
//   BOUNCE               → BOUNCED      + suppression BOUNCE
//   COMPLAINT            → UNSUBSCRIBED + suppression COMPLAINT
//   PROVIDER_SUPPRESSED  → SUPPRESSED   + suppression PROVIDER_SUPPRESSED
// A changed row gets resend_synced_at = NULL, so the regular Contact sync
// (contact-sync.ts) pushes the Contact to unsubscribed afterwards.
//
// One-way on purpose: an address that has left the Resend list is never
// moved back to SUBSCRIBED here — lifting a strong suppression is an
// explicit admin decision. Addresses with no subscriber row (promo
// prospects, service mail recipients) are counted but not touched.
//
// Used by the contact-sync cron (apply) and by
// scripts/newsletter/reconcile-resend-suppressions.ts (dry-run by default).
// Storage is injected so the rules are unit-tested without a database.

export type ProviderSuppressionApplyInput = {
  email: string;
  suppressionId: string | null;
  sourceEmailId: string | null;
  classification: SuppressionClassification;
};

export type ProviderSuppressionApplyResult = {
  outcome: "updated" | "already" | "not_found";
  subscriberId: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  effectiveReason: string | null;
};

export type ReconcileSubscriber = { id: string; email: string; status: string };

export type LocalSuppression = {
  email: string;
  reason: string;
  provider_suppression_id: string | null;
  verified_at: string | null;
};

export type ReconcileStore = {
  loadSubscribers(): Promise<ReconcileSubscriber[]>;
  loadLocalSuppressions(): Promise<LocalSuppression[]>;
  applyProviderSuppression(input: ProviderSuppressionApplyInput): Promise<ProviderSuppressionApplyResult>;
};

// ---------------------------------------------------------------------------
// Planning (pure) — mirrors newsletter_apply_provider_suppression
// ---------------------------------------------------------------------------

export function effectiveSuppressionReason(local: string | null | undefined, incoming: ProviderSuppressionReason): string {
  return local && suppressionRank(local) >= suppressionRank(incoming) ? local : incoming;
}

function statusForReason(reason: string): string {
  return PROVIDER_REASON_STATUS[reason as ProviderSuppressionReason] ?? "SUPPRESSED";
}

export type StatusPlan = { targetStatus: string; newStatus: string; statusChange: boolean; contactChange: boolean };

// What the SQL function will do to a row in `currentStatus` whose strongest
// suppression reason becomes `effectiveReason`. Only SUBSCRIBED rows move,
// plus SUPPRESSED rows whose cause is now confirmed. The Contact changes
// (subscribed → unsubscribed) only for rows leaving SUBSCRIBED.
export function planStatusChange(currentStatus: string, effectiveReason: string): StatusPlan {
  const targetStatus = statusForReason(effectiveReason);
  const statusChange =
    currentStatus === "SUBSCRIBED" ||
    (currentStatus === "SUPPRESSED" && (targetStatus === "UNSUBSCRIBED" || targetStatus === "BOUNCED"));
  return {
    targetStatus,
    newStatus: statusChange ? targetStatus : currentStatus,
    statusChange,
    contactChange: statusChange && currentStatus === "SUBSCRIBED",
  };
}

// Already applied for this exact Resend suppression with a verified
// classification, and the row's status agrees — nothing to look up.
// Unverified (fail-closed) entries are re-checked every run until a lookup
// succeeds.
export function isReconciled(subscriber: ReconcileSubscriber, local: LocalSuppression | undefined, suppression: AccountSuppression): boolean {
  if (!local || !local.verified_at) return false;
  if (local.provider_suppression_id !== suppression.id) return false;
  if (suppressionRank(local.reason) < suppressionRank("PROVIDER_SUPPRESSED")) return false;
  return !planStatusChange(subscriber.status, local.reason).statusChange;
}

export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  const [host = "", ...rest] = domain.split(".");
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ""}*` : `${local[0]}${"*".repeat(Math.min(local.length - 2, 6))}${local[local.length - 1]}`;
  return `${maskedLocal}@${host[0] ?? ""}***${rest.length ? `.${rest.join(".")}` : ""}`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export type ReconcileItem = {
  subscriberId: string;
  maskedEmail: string;
  currentStatus: string;
  reason: ProviderSuppressionReason;
  basis: ClassificationBasis;
  verified: boolean;
  effectiveReason: string;
  newStatus: string;
  statusChange: boolean;
  contactChange: boolean;
  // apply mode only
  result?: ProviderSuppressionApplyResult["outcome"] | "failed";
};

export type ReconcileSummary = {
  mode: "dry-run" | "apply";
  // false: the run couldn't read its inputs (error set), or some item failed.
  ok: boolean;
  error: string | null;
  accountSuppressions: number;
  // Account suppressions with a newsletter_subscribers row.
  matchedSubscribers: number;
  upToDate: number;
  checked: number;
  // Matches left for the next run (maxChecks reached).
  deferred: number;
  classified: Record<ProviderSuppressionReason, number>;
  unverified: number;
  plannedSubscriberChanges: number;
  plannedContactChanges: number;
  updated: number;
  already: number;
  notFound: number;
  failed: number;
  // Rows the SQL function moved — their Contact needs a sync.
  changedSubscriberIds: string[];
  items: ReconcileItem[];
};

function emptySummary(apply: boolean): ReconcileSummary {
  return {
    mode: apply ? "apply" : "dry-run",
    ok: true,
    error: null,
    accountSuppressions: 0,
    matchedSubscribers: 0,
    upToDate: 0,
    checked: 0,
    deferred: 0,
    classified: { BOUNCE: 0, COMPLAINT: 0, PROVIDER_SUPPRESSED: 0 },
    unverified: 0,
    plannedSubscriberChanges: 0,
    plannedContactChanges: 0,
    updated: 0,
    already: 0,
    notFound: 0,
    failed: 0,
    changedSubscriberIds: [],
    items: [],
  };
}

function errorText(err: unknown): string {
  const message = redactSecrets(err instanceof Error ? err.message : String(err));
  return message.length > 300 ? `${message.slice(0, 300)}…` : message;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function reconcileProviderSuppressions(deps: {
  store: ReconcileStore;
  client: SuppressionLookupClient;
  // false (dry-run): Resend and Supabase are only read.
  apply: boolean;
  // Cap on matches classified per run (each may cost one GET /emails).
  maxChecks?: number;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  retry?: RetryOptions;
}): Promise<ReconcileSummary> {
  const { store, client, apply, maxChecks = Infinity, delayMs = 250, sleep = defaultSleep, retry } = deps;
  const summary = emptySummary(apply);

  let account: AccountSuppression[];
  let subscribers: ReconcileSubscriber[];
  let locals: LocalSuppression[];
  try {
    [account, subscribers, locals] = await Promise.all([
      listAccountSuppressions(client, retry),
      store.loadSubscribers(),
      store.loadLocalSuppressions(),
    ]);
  } catch (err) {
    return { ...summary, ok: false, error: errorText(err) };
  }

  summary.accountSuppressions = account.length;
  const byEmail = new Map(subscribers.map((s) => [s.email.trim().toLowerCase(), s]));
  const localByEmail = new Map(locals.map((l) => [l.email.trim().toLowerCase(), l]));

  const pending: { suppression: AccountSuppression; subscriber: ReconcileSubscriber; local: LocalSuppression | undefined }[] = [];
  for (const suppression of account) {
    const subscriber = byEmail.get(suppression.email);
    if (!subscriber) continue;
    summary.matchedSubscribers++;
    const local = localByEmail.get(suppression.email);
    if (isReconciled(subscriber, local, suppression)) summary.upToDate++;
    else pending.push({ suppression, subscriber, local });
  }

  for (const { suppression, subscriber, local } of pending) {
    if (summary.checked >= maxChecks) {
      summary.deferred++;
      continue;
    }
    if (summary.checked > 0 && delayMs > 0) await sleep(delayMs);
    summary.checked++;

    const classification = await classifyAccountSuppression(client, suppression, retry);
    summary.classified[classification.reason]++;
    if (!classification.verified) summary.unverified++;

    const effectiveReason = effectiveSuppressionReason(local?.reason, classification.reason);
    const plan = planStatusChange(subscriber.status, effectiveReason);
    if (plan.statusChange) summary.plannedSubscriberChanges++;
    if (plan.contactChange) summary.plannedContactChanges++;

    const item: ReconcileItem = {
      subscriberId: subscriber.id,
      maskedEmail: maskEmail(suppression.email),
      currentStatus: subscriber.status,
      reason: classification.reason,
      basis: classification.basis,
      verified: classification.verified,
      effectiveReason,
      newStatus: plan.newStatus,
      statusChange: plan.statusChange,
      contactChange: plan.contactChange,
    };
    summary.items.push(item);
    if (!apply) continue;

    try {
      const result = await store.applyProviderSuppression({
        email: suppression.email,
        suppressionId: suppression.id,
        sourceEmailId: suppression.sourceEmailId,
        classification,
      });
      item.result = result.outcome;
      if (result.outcome === "updated") {
        summary.updated++;
        if (result.subscriberId) summary.changedSubscriberIds.push(result.subscriberId);
      } else if (result.outcome === "already") summary.already++;
      else summary.notFound++;
    } catch (err) {
      item.result = "failed";
      summary.failed++;
      // Subscriber id only — never the address.
      console.error("[newsletter] provider suppression 반영 실패:", subscriber.id, errorText(err));
    }
  }

  summary.ok = summary.failed === 0;
  return summary;
}

// Counts only — for HTTP responses / logs (no masked addresses either).
export function summarizeReconcile(summary: ReconcileSummary): Omit<ReconcileSummary, "items" | "changedSubscriberIds"> {
  const counts: Partial<ReconcileSummary> = { ...summary };
  delete counts.items;
  delete counts.changedSubscriberIds;
  return counts as Omit<ReconcileSummary, "items" | "changedSubscriberIds">;
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

const APPLY_OUTCOMES = new Set(["updated", "already", "not_found"]);

// newsletter_apply_provider_suppression (0030). Throws on any error.
export async function applyProviderSuppressionRpc(
  db: SupabaseClient,
  input: ProviderSuppressionApplyInput,
): Promise<ProviderSuppressionApplyResult> {
  const c = input.classification;
  const { data, error } = await db.rpc("newsletter_apply_provider_suppression", {
    p_email: input.email,
    p_reason: c.reason,
    p_provider_origin: c.origin,
    p_provider_suppression_id: input.suppressionId,
    p_source_email_id: input.sourceEmailId,
    p_bounce_type: c.bounceType,
    p_bounce_sub_type: c.bounceSubType,
    p_verified: c.verified,
  });
  if (error) throw new Error(`provider suppression 반영 실패: ${error.message}`);

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const outcome = row?.outcome;
  if (typeof outcome !== "string" || !APPLY_OUTCOMES.has(outcome)) {
    throw new Error("provider suppression 반영 결과를 해석할 수 없습니다.");
  }
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    outcome: outcome as ProviderSuppressionApplyResult["outcome"],
    subscriberId: str(row?.subscriber_id),
    previousStatus: str(row?.previous_status),
    newStatus: str(row?.new_status),
    effectiveReason: str(row?.effective_reason),
  };
}

export function createReconcileStore(db: SupabaseClient): ReconcileStore {
  return {
    loadSubscribers: () =>
      fetchAllRows<ReconcileSubscriber>((from, to) =>
        db.from("newsletter_subscribers").select("id, email, status").order("id").range(from, to),
      ),
    loadLocalSuppressions: () =>
      fetchAllRows<LocalSuppression>((from, to) =>
        db
          .from("newsletter_suppressions")
          .select("email, reason, provider_suppression_id, verified_at")
          .order("id")
          .range(from, to),
      ),
    applyProviderSuppression: (input) => applyProviderSuppressionRpc(db, input),
  };
}
