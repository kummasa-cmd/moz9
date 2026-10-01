import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignOverdue, type CampaignOverdueKind, type OverdueCampaignInput } from "./campaign-overdue";
import { fetchAllRows } from "./paginate";

// Newsletter scheduler health check (Scheduler Reliability E-2), served by
// /api/cron/newsletter/health and meant to be polled by an external monitor
// on its own schedule — deliberately *not* run from send-due, so it keeps
// reporting when the send scheduler itself has stopped.
//
// Read-only: it loads campaigns and judges them with the same
// campaignOverdue() the admin list uses, so the two never disagree. It never
// sends, claims, writes or calls Resend.
//
// What it can't prove: that send-due actually ran every 5 minutes. With no
// campaign due, a stopped scheduler still looks healthy here — that part is
// read from the scheduler's own execution history.

export type HealthIssueType = "SCHEDULED_OVERDUE" | "RECURRING_OVERDUE" | "SENDING_STALLED";

const ISSUE_TYPE: Record<CampaignOverdueKind, HealthIssueType> = {
  scheduled_late: "SCHEDULED_OVERDUE",
  daily_late: "RECURRING_OVERDUE",
  sending_stalled: "SENDING_STALLED",
};

// Only these statuses can be late or stuck; SENT / PARTIAL / FAILED /
// CANCELLED / DRAFT are finished or parked and never reported.
export const HEALTH_CHECKED_STATUSES = ["SCHEDULED", "SENDING"] as const;

export type HealthCampaign = OverdueCampaignInput & { id: string };

export type HealthIssue = {
  type: HealthIssueType;
  // First 8 characters only — enough to find it in the admin list.
  campaignId: string;
  minutesLate: number;
  // When it was due (or claimed, for SENDING_STALLED), ISO UTC.
  since: string;
};

export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  unhealthyCount: number;
  issues: HealthIssue[];
};

export function evaluateSchedulerHealth(campaigns: HealthCampaign[], now: Date): HealthReport {
  const issues: HealthIssue[] = [];
  for (const campaign of campaigns) {
    const overdue = campaignOverdue(campaign, now);
    if (!overdue) continue;
    issues.push({
      type: ISSUE_TYPE[overdue.kind],
      campaignId: campaign.id.slice(0, 8),
      minutesLate: overdue.minutesLate,
      since: overdue.since,
    });
  }
  issues.sort((a, b) => b.minutesLate - a.minutesLate);
  return { ok: issues.length === 0, checkedAt: now.toISOString(), unhealthyCount: issues.length, issues };
}

// Every SCHEDULED / SENDING campaign, paged so a long list is never silently
// cut short. Throws on any DB error — the caller must not report healthy.
export async function loadHealthCampaigns(db: SupabaseClient): Promise<HealthCampaign[]> {
  return fetchAllRows<HealthCampaign>((from, to) =>
    db
      .from("newsletter_campaigns")
      .select(
        "id, status, send_type, scheduled_at, recurring_time, range_start, range_end, last_sent_date, sending_started_at, created_at",
      )
      .in("status", [...HEALTH_CHECKED_STATUSES])
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export type HealthResponse = { status: number; body: Record<string, unknown> };

// The whole endpoint minus Next.js, so auth and failure handling are tested.
// Same auth rule as send-due / sync-contacts: Bearer CRON_SECRET, 401 when it
// is missing, wrong, or not configured.
export async function handleSchedulerHealth(input: {
  authorization: string | null;
  cronSecret: string;
  loadCampaigns: () => Promise<HealthCampaign[]>;
  now?: () => Date;
}): Promise<HealthResponse> {
  if (!input.cronSecret || input.authorization !== `Bearer ${input.cronSecret}`) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  let campaigns: HealthCampaign[];
  try {
    campaigns = await input.loadCampaigns();
  } catch (err) {
    // Fail closed: an unreadable DB is not a healthy scheduler. The detail
    // stays in the server log; the response carries a fixed code only.
    console.error("[newsletter] health check failed:", err instanceof Error ? err.message : String(err));
    return { status: 500, body: { ok: false, error: "HEALTH_CHECK_FAILED" } };
  }

  const report = evaluateSchedulerHealth(campaigns, (input.now ?? (() => new Date()))());
  return { status: report.ok ? 200 : 503, body: report };
}
