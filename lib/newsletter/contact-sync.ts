import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  installSdkErrorLogger,
  isContactUnsubscribed,
  redactEmails,
  upsertResendContact,
  type ContactSyncResult,
  type ResendContactsClient,
  type RetryOptions,
} from "./resend-contacts";

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

// Retries subscribers whose Resend Contact is not in sync (resend_sync_error
// set or resend_synced_at NULL). Meant for a cron route separate from
// send-due: small batches, paced requests, and it stands down while a
// campaign is sending so it can't eat into the send path's rate limit.
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

  const client = createContactsClient();
  for (const row of (data ?? []) as SubscriberSyncRow[]) {
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
