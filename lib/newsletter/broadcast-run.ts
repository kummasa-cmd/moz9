import { kstDateString } from "./schedule-time";
import { DEFAULT_DAILY_SEND_TIME } from "./campaign-due";

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

// ---------------------------------------------------------------------------
// Preflight-blocked campaigns (B1)
// ---------------------------------------------------------------------------

// How long after its due time a campaign blocked by the Broadcast preflight
// goes back to SCHEDULED, so send-due (every 5 min) re-checks it once the
// contact-sync cron has fixed the drift. Each retry runs the full preflight
// again, so retrying never weakens the check. After the window it becomes
// FAILED and needs an admin.
export const PREFLIGHT_RETRY_WINDOW_MS = 2 * 60 * 60 * 1000;

export type CampaignTiming = {
  send_type: string;
  scheduled_at: string | null;
  recurring_time: string | null;
  created_at: string;
};

// When this run was supposed to go out. RECURRING / RANGE: today's KST send
// time (DEFAULT_DAILY_SEND_TIME when unset, as in campaign-due.ts).
export function campaignDueAt(campaign: CampaignTiming, now: Date): Date {
  if (campaign.send_type === "RECURRING" || campaign.send_type === "RANGE") {
    const raw = campaign.recurring_time ?? DEFAULT_DAILY_SEND_TIME;
    const time = raw.length === 5 ? `${raw}:00` : raw.slice(0, 8);
    return new Date(`${kstDateString(now)}T${time}+09:00`);
  }
  if (campaign.send_type === "SCHEDULED" && campaign.scheduled_at) return new Date(campaign.scheduled_at);
  return new Date(campaign.created_at);
}

export function preflightBlockedOutcome(
  campaign: CampaignTiming,
  now: Date,
): { status: "SCHEDULED" | "FAILED"; retryUntil: Date } {
  const retryUntil = new Date(campaignDueAt(campaign, now).getTime() + PREFLIGHT_RETRY_WINDOW_MS);
  return { status: now.getTime() <= retryUntil.getTime() ? "SCHEDULED" : "FAILED", retryUntil };
}

// "HH:mm KST" for admin messages.
export function formatKstTime(date: Date): string {
  return `${new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(11, 16)} KST`;
}
