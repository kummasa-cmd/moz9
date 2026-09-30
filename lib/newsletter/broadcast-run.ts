import { kstDateString } from "./schedule-time";

// Pure rules for newsletter_broadcast_sends (3단계) — one row per Broadcast
// run, unique on (campaign_id, run_key). Kept free of DB imports for tests.

export type BroadcastRunStatus = "CREATING" | "DRAFT" | "SEND_REQUESTED" | "FAILED";

// One-shot campaigns (IMMEDIATE / SCHEDULED) get exactly one Broadcast ever.
// RECURRING / RANGE get one per KST day — the same rule last_sent_date
// enforces for the legacy path, except a manual "지금 발송" can't bypass it:
// a second Broadcast the same day is refused.
export function broadcastRunKey(sendType: string, now: Date): string {
  return sendType === "RECURRING" || sendType === "RANGE" ? kstDateString(now) : "once";
}

export type ExistingBroadcastRun = {
  status: string;
  resend_broadcast_id: string | null;
};

// What to do when a row for this (campaign, run_key) already exists.
// Only a run that failed *before Resend handed back a broadcast id* may be
// reused — at worst that leaves an unsent draft behind, never a sent email.
// Everything else might already have gone out (or be mid-flight), so it is
// refused and has to be checked by hand in the Resend dashboard.
export function decideExistingBroadcastRun(row: ExistingBroadcastRun): "reuse" | "refuse" {
  return row.status === "FAILED" && !row.resend_broadcast_id ? "reuse" : "refuse";
}

export function broadcastName(input: { subject: string; runKey: string; campaignId: string }): string {
  return `[검레터] ${input.subject} · ${input.runKey} · ${input.campaignId.slice(0, 8)}`;
}
