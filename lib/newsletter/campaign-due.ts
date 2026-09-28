import { kstDateString, kstTimeString } from "./schedule-time";

// Pure scheduling rules for newsletter campaigns — kept free of DB/Resend
// imports so the date math can be tested in isolation. All dates and times
// here are KST (see schedule-time.ts).

// Daily send time used when a campaign has no recurring_time — RANGE
// campaigns have no time picker in the admin form. 09:00 KST matches when
// they effectively went out before, when "today" was computed in UTC and the
// first cron run of a new UTC day landed at 09:00 KST.
export const DEFAULT_DAILY_SEND_TIME = "09:00:00";

export type DueCampaign = {
  id: string;
  send_type: string;
  scheduled_at: string | null;
  recurring_time: string | null;
  range_start: string | null;
  range_end: string | null;
  last_sent_date: string | null;
};

// Postgres `time` comes back as "HH:mm:ss"; the form's <input type="time">
// submits "HH:mm". Normalize to "HH:mm:ss" so plain string comparison works.
function normalizeTime(value: string | null): string {
  if (!value) return DEFAULT_DAILY_SEND_TIME;
  return value.length === 5 ? `${value}:00` : value.slice(0, 8);
}

export function isCampaignDue(campaign: DueCampaign, now: Date): boolean {
  const today = kstDateString(now);
  const dailyTimeReached = kstTimeString(now) >= normalizeTime(campaign.recurring_time);

  if (campaign.send_type === "SCHEDULED") {
    return campaign.scheduled_at !== null && new Date(campaign.scheduled_at).getTime() <= now.getTime();
  }
  if (campaign.send_type === "RECURRING") {
    return campaign.last_sent_date !== today && dailyTimeReached;
  }
  if (campaign.send_type === "RANGE") {
    return (
      (campaign.range_start ?? "") <= today &&
      today <= (campaign.range_end ?? "") &&
      campaign.last_sent_date !== today &&
      dailyTimeReached
    );
  }
  // IMMEDIATE campaigns are normally sent right after creation, but this is a
  // safety net in case one was left in SCHEDULED status without being sent.
  return campaign.send_type === "IMMEDIATE";
}

// Status after a run that delivered to every recipient: one-shot campaigns
// are done, RECURRING (and RANGE before its last day) go back to SCHEDULED
// for the next day's run.
function statusAfterRun(sendType: string, rangeEnd: string | null, now: Date): "SENT" | "SCHEDULED" {
  if (sendType === "RECURRING") return "SCHEDULED";
  if (sendType === "RANGE") {
    return rangeEnd && kstDateString(now) >= rangeEnd ? "SENT" : "SCHEDULED";
  }
  return "SENT";
}

export type CampaignRunOutcome = {
  sendType: string;
  rangeEnd: string | null;
  recipients: number;
  sent: number;
  now: Date;
};

// FAILED when nothing went out at all. PARTIAL only replaces what would
// otherwise be the final SENT — a RECURRING/RANGE campaign with some failures
// mid-run still goes back to SCHEDULED so tomorrow's run isn't lost (the
// failure count stays visible in total_failed).
export function campaignStatusAfterRun(
  outcome: CampaignRunOutcome,
): "SENT" | "SCHEDULED" | "PARTIAL" | "FAILED" {
  if (outcome.recipients > 0 && outcome.sent === 0) return "FAILED";
  const status = statusAfterRun(outcome.sendType, outcome.rangeEnd, outcome.now);
  if (status === "SENT" && outcome.sent < outcome.recipients) return "PARTIAL";
  return status;
}
