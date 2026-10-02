import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllRows } from "./paginate";
import {
  installSdkErrorLogger,
  isContactUnsubscribed,
  isSuppressionNewerThanSync,
  redactEmails,
  upsertResendContact,
  type ContactSyncResult,
  type ResendContactsClient,
  type RetryOptions,
} from "./resend-contacts";
import type { SuppressionLookupClient } from "./resend-suppressions";
import {
  createReconcileStore,
  reconcileProviderSuppressions,
  summarizeReconcile,
  type ReconcileSummary,
} from "./suppression-reconcile";

// Supabase ↔ Resend Contacts wiring for the regular newsletter (2단계).
// Supabase stays the source of truth: every function here runs *after* the
// Supabase write it mirrors, never throws, and on failure only records
// resend_sync_error — the subscriber's status is never rolled back.
//
// Env is read lazily (not at module load) so scripts can load .env first.

export function isContactSyncEnabled(): boolean {
  return process.env.NEWSLETTER_CONTACT_SYNC_ENABLED === "true" && !!process.env.RESEND_API_KEY;
}

function getSegmentId(): string | null {
  return process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim() || null;
}

// Only this Contacts client gets the email-masking error logger; the send
// path's Resend instances (scheduler.ts, lib/mail.ts) are left untouched.
export function createContactsClient(): ResendContactsClient {
  return installSdkErrorLogger(new Resend(process.env.RESEND_API_KEY));
}

// Resend account suppression → Supabase (Stage 4.5). Off unless
// NEWSLETTER_SUPPRESSION_RECONCILE_ENABLED=true: once on, the contact-sync
// cron and the webhook move suppressed subscribers out of SUBSCRIBED on
// their own, so it is switched on only after the first reconciliation has
// been reviewed (scripts/newsletter/reconcile-resend-suppressions.ts).
// The Broadcast preflight's suppression check doesn't depend on it.
export function isSuppressionReconcileEnabled(): boolean {
  return process.env.NEWSLETTER_SUPPRESSION_RECONCILE_ENABLED === "true" && !!process.env.RESEND_API_KEY;
}

// Read-only use: suppressions list/get + emails.get.
export function createSuppressionsClient(): SuppressionLookupClient {
  return installSdkErrorLogger(new Resend(process.env.RESEND_API_KEY));
}

export const SUBSCRIBER_SYNC_COLUMNS =
  "id, email, name, status, resend_contact_id, resend_synced_at, resend_sync_error, created_at";

export type SubscriberSyncRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  resend_contact_id: string | null;
  resend_synced_at: string | null;
  resend_sync_error: string | null;
  created_at: string;
};

// Sync error text is stored for diagnosis only — keep it bounded.
function truncateError(message: string): string {
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

async function isSuppressed(db: SupabaseClient, email: string): Promise<boolean> {
  const { data, error } = await db
    .from("newsletter_suppressions")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

// Pushes one row's state to Resend and records the outcome on the row.
// `suppressed` may be passed in by bulk callers that already loaded the
// suppression list; otherwise it's looked up.
export async function syncSubscriberRow(
  row: SubscriberSyncRow,
  deps: {
    db: SupabaseClient;
    client: ResendContactsClient;
    suppressed?: boolean;
    retry?: RetryOptions;
  },
): Promise<ContactSyncResult> {
  const { db, client } = deps;

  let result: ContactSyncResult;
  try {
    const suppressed = deps.suppressed ?? (await isSuppressed(db, row.email));
    const unsubscribed = isContactUnsubscribed(row.status, suppressed);
    result = await upsertResendContact(
      client,
      {
        email: row.email,
        unsubscribed,
        firstName: row.name,
        contactId: row.resend_contact_id,
        segmentId: unsubscribed ? null : getSegmentId(),
        createIfMissing: !unsubscribed,
      },
      deps.retry,
    );
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err), retryable: true };
  }

  if (result.ok) {
    // Only mark synced if the status is still the one we just pushed — if it
    // changed mid-sync, that change reset resend_synced_at and the row must
    // stay pending for the next retry.
    const { error } = await db
      .from("newsletter_subscribers")
      .update({
        resend_contact_id: result.contactId ?? row.resend_contact_id,
        resend_synced_at: new Date().toISOString(),
        resend_sync_error: null,
      })
      .eq("id", row.id)
      .eq("status", row.status);
    if (error) console.error("[newsletter] Resend 동기화 결과 저장 실패:", row.id, error.message);
  } else {
    const { error } = await db
      .from("newsletter_subscribers")
      .update({ resend_sync_error: truncateError(result.error) })
      .eq("id", row.id);
    if (error) console.error("[newsletter] Resend 동기화 오류 저장 실패:", row.id, error.message);
    console.error("[newsletter] Resend Contact 동기화 실패:", row.id, redactEmails(result.error));
  }

  return result;
}

export type SingleSyncOutcome = ContactSyncResult | { ok: true; skipped: "disabled" | "not_found" };

// Mirrors one subscriber's current status to Resend. Called after
// subscribe / unsubscribe / admin status changes (via next/server `after`),
// so it runs once the Supabase write is done and never blocks or fails it.
export async function syncSubscriberContact(subscriberId: string): Promise<SingleSyncOutcome> {
  if (!isContactSyncEnabled()) return { ok: true, skipped: "disabled" };

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_SYNC_COLUMNS)
      .eq("id", subscriberId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { ok: true, skipped: "not_found" };

    return await syncSubscriberRow(data as SubscriberSyncRow, { db, client: createContactsClient() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[newsletter] Resend Contact 동기화 실패:", subscriberId, redactEmails(message));
    return { ok: false, error: message, retryable: true };
  }
}

// Admin delete removes the Supabase row, so there's nothing left to retry
// from — best effort: opt the Resend Contact out so a later Broadcast can't
// reach an address we no longer hold. Failures are only logged.
export async function unsubscribeDeletedContacts(
  rows: { email: string; resend_contact_id: string | null }[],
): Promise<void> {
  if (!isContactSyncEnabled() || rows.length === 0) return;

  const client = createContactsClient();
  for (const row of rows) {
    const result = await upsertResendContact(client, {
      email: row.email,
      unsubscribed: true,
      contactId: row.resend_contact_id,
      createIfMissing: false,
    });
    if (!result.ok) {
      console.error(
        "[newsletter] 삭제된 구독자의 Resend Contact 수신거부 실패:",
        row.resend_contact_id ?? "(no contact id)",
        redactEmails(result.error),
      );
    }
  }
}

// Filter for rows whose Resend state may be stale: never synced, changed
// since the last sync (status changes reset resend_synced_at), or failed.
export const PENDING_SYNC_FILTER = "resend_synced_at.is.null,resend_sync_error.not.is.null";

// True while a campaign is mid-send. Resend's rate limit (default 10 req/s)
// is per team and shared with resend.batch.send, which doesn't retry 429s —
// so bulk Contact syncs back off entirely rather than risk failing a chunk.
export async function isCampaignSending(db: SupabaseClient): Promise<boolean> {
  const { count, error } = await db
    .from("newsletter_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "SENDING");
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

export type PendingSyncSummary = {
  skipped?: "disabled" | "campaign_sending";
  attempted: number;
  succeeded: number;
  failed: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// The retry queue: rows flagged pending (PENDING_SYNC_FILTER), plus SUBSCRIBED
// rows whose address was suppressed after their last successful sync — those
// look synced but Resend may still have them subscribed (see
// isSuppressionNewerThanSync). Pending rows keep their order and come first;
// duplicates are dropped; the total is capped at `limit`.
export function buildContactSyncQueue(
  pending: SubscriberSyncRow[],
  suppressedSubscribed: SubscriberSyncRow[],
  suppressedAt: Map<string, string>,
  limit: number,
): SubscriberSyncRow[] {
  const queue = [...pending];
  const seen = new Set(pending.map((row) => row.id));
  for (const row of suppressedSubscribed) {
    if (seen.has(row.id)) continue;
    if (row.status !== "SUBSCRIBED") continue;
    if (!isSuppressionNewerThanSync(row.resend_synced_at, suppressedAt.get(row.email) ?? null)) continue;
    queue.push(row);
    seen.add(row.id);
  }
  return queue.slice(0, limit);
}

const SUPPRESSION_LOOKUP_CHUNK = 200;

// SUBSCRIBED rows that are on the suppression list, with each address's
// suppression time. Paged, so a long list is never silently truncated.
async function loadSuppressedSubscribers(
  db: SupabaseClient,
): Promise<{ rows: SubscriberSyncRow[]; suppressedAt: Map<string, string> }> {
  const suppressions = await fetchAllRows<{ email: string; unsubscribed_at: string }>((from, to) =>
    db.from("newsletter_suppressions").select("email, unsubscribed_at").order("id").range(from, to),
  );
  const suppressedAt = new Map(suppressions.map((s) => [s.email, s.unsubscribed_at]));
  const emails = [...suppressedAt.keys()];
  const rows: SubscriberSyncRow[] = [];
  for (let i = 0; i < emails.length; i += SUPPRESSION_LOOKUP_CHUNK) {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .select(SUBSCRIBER_SYNC_COLUMNS)
      .eq("status", "SUBSCRIBED")
      .in("email", emails.slice(i, i + SUPPRESSION_LOOKUP_CHUNK));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SubscriberSyncRow[]));
  }
  return { rows, suppressedAt };
}

// Retries subscribers whose Resend Contact may not be in sync: resend_sync_error
// set, resend_synced_at NULL, or suppressed after the last sync. Meant for a
// cron route separate from send-due (.github/workflows/newsletter-contact-sync.yml):
// small batches, paced requests, and it stands down while a campaign is
// sending so it can't eat into the send path's rate limit.
// Does not touch newsletter_campaigns / deliveries.
export async function retryPendingContactSyncs(
  options: { limit?: number; delayMs?: number } = {},
): Promise<PendingSyncSummary> {
  const summary: PendingSyncSummary = { attempted: 0, succeeded: 0, failed: 0 };
  if (!isContactSyncEnabled()) return { ...summary, skipped: "disabled" };

  const { limit = 50, delayMs = 500 } = options;
  const db = createAdminClient();

  if (await isCampaignSending(db)) return { ...summary, skipped: "campaign_sending" };

  const { data, error } = await db
    .from("newsletter_subscribers")
    .select(SUBSCRIBER_SYNC_COLUMNS)
    .or(PENDING_SYNC_FILTER)
    // Rows that never failed first, so a few permanently failing addresses
    // can't fill every batch and starve the rest of the queue.
    .order("resend_sync_error", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const suppressed = await loadSuppressedSubscribers(db);
  const queue = buildContactSyncQueue((data ?? []) as SubscriberSyncRow[], suppressed.rows, suppressed.suppressedAt, limit);

  const client = createContactsClient();
  for (const row of queue) {
    // Never-synced unsubscribed rows are a no-op lookup at most (see
    // createIfMissing) — still run them so they stop showing as pending.
    if (summary.attempted > 0) await sleep(delayMs);
    summary.attempted++;
    const result = await syncSubscriberRow(row, { db, client });
    if (result.ok) summary.succeeded++;
    else summary.failed++;
  }

  return summary;
}

// ---------------------------------------------------------------------------
// The contact-sync cron cycle: suppression reconciliation, then Contact retries
// ---------------------------------------------------------------------------

export type ReconcileCronResult =
  | { skipped: "disabled" | "contact_sync_disabled" | "campaign_sending" }
  | ReturnType<typeof summarizeReconcile>;

export type ContactSyncCycleResult = {
  // false when the reconciliation couldn't read Resend / Supabase or some
  // subscriber failed to apply — the route answers non-2xx so the scheduler
  // shows it, instead of passing it off as success.
  ok: boolean;
  summary: PendingSyncSummary & { reconciliation: ReconcileCronResult };
};

export type ContactSyncCycleDeps = {
  contactSyncEnabled: () => boolean;
  reconcileEnabled: () => boolean;
  campaignSending: () => Promise<boolean>;
  reconcile: () => Promise<ReconcileSummary>;
  retryPending: () => Promise<PendingSyncSummary>;
};

// Reconciliation runs first so the rows it moves out of SUBSCRIBED
// (resend_synced_at = NULL) are pushed to Resend by the retry pass of the
// same run. A reconciliation failure doesn't stop the Contact retries.
// Both stand down while a campaign is SENDING (shared Resend rate limit).
export async function runContactSyncCycle(deps: ContactSyncCycleDeps): Promise<ContactSyncCycleResult> {
  const idle: PendingSyncSummary = { attempted: 0, succeeded: 0, failed: 0 };
  if (!deps.contactSyncEnabled()) {
    return { ok: true, summary: { ...idle, skipped: "disabled", reconciliation: { skipped: "contact_sync_disabled" } } };
  }
  if (await deps.campaignSending()) {
    return { ok: true, summary: { ...idle, skipped: "campaign_sending", reconciliation: { skipped: "campaign_sending" } } };
  }

  let reconciliation: ReconcileCronResult = { skipped: "disabled" };
  let ok = true;
  if (deps.reconcileEnabled()) {
    const result = await deps.reconcile();
    reconciliation = summarizeReconcile(result);
    ok = result.ok;
    if (!result.ok) {
      console.error("[newsletter] Resend suppression 정합화 실패:", result.error ?? `${result.failed}건 반영 실패`);
    }
  }

  const sync = await deps.retryPending();
  return { ok, summary: { ...sync, reconciliation } };
}

// Per-run cap on suppressions classified (each may cost one GET /emails);
// the rest are counted as deferred and picked up by the next run.
const RECONCILE_MAX_CHECKS_PER_RUN = 10;

export async function runContactSyncCron(): Promise<ContactSyncCycleResult> {
  const db = createAdminClient();
  return runContactSyncCycle({
    contactSyncEnabled: isContactSyncEnabled,
    reconcileEnabled: isSuppressionReconcileEnabled,
    campaignSending: () => isCampaignSending(db),
    reconcile: () =>
      reconcileProviderSuppressions({
        store: createReconcileStore(db),
        client: createSuppressionsClient(),
        apply: true,
        maxChecks: RECONCILE_MAX_CHECKS_PER_RUN,
      }),
    retryPending: () => retryPendingContactSyncs(),
  });
}
