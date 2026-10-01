import { DEFAULT_DAILY_SEND_TIME } from "./campaign-due";
import { kstDateString } from "./schedule-time";

// Read-only "this should have gone out by now" check for the admin list
// (Scheduler Reliability E-1). It only labels a campaign — nothing here
// sends, retries or changes a status. Dates and times are KST, like the due
// rules in campaign-due.ts.

// A campaign is flagged once it is more than this late.
export const OVERDUE_GRACE_MS = 15 * 60 * 1000;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CampaignOverdueKind =
  // SCHEDULED campaign whose scheduled_at passed without a send
  | "scheduled_late"
  // RECURRING / RANGE campaign whose daily run didn't happen
  | "daily_late"
  // claimed (SENDING) but never finished
  | "sending_stalled";

export type CampaignOverdue = { kind: CampaignOverdueKind; since: string; minutesLate: number };

export type OverdueCampaignInput = {
  status: string;
  send_type: string;
  scheduled_at: string | null;
  recurring_time: string | null;
  range_start: string | null;
  range_end: string | null;
  last_sent_date: string | null;
  sending_started_at: string | null;
  created_at: string | null;
};

// "HH:mm" or "HH:mm:ss" (Postgres time) -> "HH:mm:ss"; RANGE campaigns have
// no time and run at the default daily time, as in campaign-due.ts.
function normalizeTime(value: string | null): string {
  if (!value) return DEFAULT_DAILY_SEND_TIME;
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

// UTC instant of the given KST date + wall-clock time.
function kstInstant(date: string, time: string): number {
  return new Date(`${date}T${time}+09:00`).getTime();
}

function late(kind: CampaignOverdueKind, dueMs: number, now: Date): CampaignOverdue | null {
  const lateMs = now.getTime() - dueMs;
  if (lateMs <= OVERDUE_GRACE_MS) return null;
  return { kind, since: new Date(dueMs).toISOString(), minutesLate: Math.floor(lateMs / 60000) };
}

// The most recent daily run that should be finished by now (its time + grace
// has passed): today's, or — shortly after midnight / before today's time —
// yesterday's. Late if last_sent_date is older than that run's KST date.
function dailyRunOverdue(c: OverdueCampaignInput, now: Date): CampaignOverdue | null {
  const time = normalizeTime(c.recurring_time);
  const today = kstDateString(now);
  let runDate = today;
  let due = kstInstant(today, time);
  if (now.getTime() - due <= OVERDUE_GRACE_MS) {
    runDate = kstDateString(new Date(now.getTime() - DAY_MS));
    due = kstInstant(runDate, time);
  }

  // Runs before the campaign existed were never owed.
  if (c.created_at && new Date(c.created_at).getTime() > due) return null;
  if (c.send_type === "RANGE" && !((c.range_start ?? "") <= runDate && runDate <= (c.range_end ?? ""))) {
    return null;
  }
  if (c.last_sent_date !== null && c.last_sent_date >= runDate) return null;
  return late("daily_late", due, now);
}

export function campaignOverdue(c: OverdueCampaignInput, now: Date): CampaignOverdue | null {
  if (c.status === "SENDING") {
    if (!c.sending_started_at) return null;
    return late("sending_stalled", new Date(c.sending_started_at).getTime(), now);
  }
  if (c.status !== "SCHEDULED") return null;

  if (c.send_type === "SCHEDULED") {
    if (!c.scheduled_at) return null;
    return late("scheduled_late", new Date(c.scheduled_at).getTime(), now);
  }
  if (c.send_type === "RECURRING" || c.send_type === "RANGE") return dailyRunOverdue(c, now);
  return null;
}

export const CAMPAIGN_OVERDUE_LABEL: Record<CampaignOverdueKind, string> = {
  scheduled_late: "예약 발송 지연",
  daily_late: "반복 발송 지연",
  sending_stalled: "발송 처리 정체",
};

// KST wall-clock of an instant for the admin list, "YYYY-MM-DD HH:mm".
export function kstLabel(iso: string): string {
  return new Date(new Date(iso).getTime() + KST_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}
