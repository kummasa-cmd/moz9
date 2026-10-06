import { isBroadcastTestCampaign } from "./broadcast-test-run";

// Per-campaign newsletter stats from whichever path actually sent it (Stage 5).
//
//   legacy     newsletter_deliveries rows (resend.batch.send + our own
//              /api/track open pixel and click redirect)
//   broadcast  newsletter_broadcast_sends runs + newsletter_broadcast_stats
//              (Resend webhook events)
//
// The path is read from what was recorded at send time — delivery rows and
// Broadcast runs — never from the current NEWSLETTER_DELIVERY_MODE. The two
// sources mean different things (legacy "sent" = accepted by the batch API,
// legacy "opened" includes clicks; Broadcast counts provider events), so they
// are never added together: a campaign with both gets both, side by side.
//
// Pure: callers load the rows and pass them in.

export type DeliveryPath = "legacy" | "broadcast" | "mixed" | "none";

// Ratio for display, or null when it can't be computed (denominator 0) — the
// admin pages render null as "-", as formatPercent does today.
export function safeRatio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

// ---------------------------------------------------------------------------
// Legacy (newsletter_deliveries) — same meaning as analytics/page.tsx today
// ---------------------------------------------------------------------------

export type LegacyDeliveryInput = {
  status: string;
  sent_at: string | null;
  opened_at: string | null;
};

export type LegacyCampaignStats = {
  // Accepted by resend.batch.send (not provider-confirmed delivery).
  sent: number;
  // opened_at set — our pixel, or a click (the click route also sets it).
  opened: number;
  // status = CLICKED.
  clicked: number;
  openRate: number | null;
  clickRate: number | null;
};

// The campaign table in analytics/page.tsx: opened / clicked over
// campaigns.total_sent.
export function legacyCampaignStats(totalSent: number | null, deliveries: LegacyDeliveryInput[]): LegacyCampaignStats {
  const sent = totalSent ?? 0;
  const opened = deliveries.filter((d) => d.opened_at).length;
  const clicked = deliveries.filter((d) => d.status === "CLICKED").length;
  return { sent, opened, clicked, openRate: safeRatio(opened, sent), clickRate: safeRatio(clicked, sent) };
}

// The summary cards in analytics/page.tsx: opened / clicked over delivery
// rows with sent_at (callers pass subscriber deliveries only, as the page's
// prospect_id filter does).
export function legacyAggregateStats(deliveries: LegacyDeliveryInput[]): LegacyCampaignStats {
  const sent = deliveries.filter((d) => d.sent_at).length;
  const opened = deliveries.filter((d) => d.opened_at).length;
  const clicked = deliveries.filter((d) => d.status === "CLICKED").length;
  return { sent, opened, clicked, openRate: safeRatio(opened, sent), clickRate: safeRatio(clicked, sent) };
}

// ---------------------------------------------------------------------------
// Broadcast (newsletter_broadcast_sends + newsletter_broadcast_stats)
// ---------------------------------------------------------------------------

export type BroadcastRunInput = {
  id: string;
  run_key: string;
  status: string; // CREATING | DRAFT | SEND_REQUESTED | FAILED
  resend_broadcast_id: string | null;
};

// One newsletter_broadcast_stats row (0029 view), as PostgREST returns it.
export type BroadcastStatsRow = {
  broadcast_send_id: string;
  recipient_estimate: number | null;
  sent: number;
  delivered: number;
  delivery_delayed: number;
  unique_opens: number;
  total_opens: number;
  unique_clicks: number;
  total_clicks: number;
  bounced: number;
  bounced_permanent: number;
  complained: number;
  failed: number;
  suppressed: number;
};

//   sent         Resend accepted the send (SEND_REQUESTED), or provider events
//                show mail went out (sent > 0)
//   unconfirmed  a Broadcast exists at Resend but the send isn't confirmed
//                (DRAFT, or FAILED after the draft) — may or may not have gone
//                out; needs a look in the Resend dashboard
//   attempt      no Broadcast was ever created (CREATING / FAILED without an
//                id) — nothing was sent
export type BroadcastRunOutcome = "sent" | "unconfirmed" | "attempt";

export function broadcastRunOutcome(run: BroadcastRunInput, stats: BroadcastStatsRow | null): BroadcastRunOutcome {
  if (run.status === "SEND_REQUESTED" || (stats?.sent ?? 0) > 0) return "sent";
  return run.resend_broadcast_id ? "unconfirmed" : "attempt";
}

export type BroadcastCampaignStats = {
  // Runs that count (outcome "sent"). 1 for IMMEDIATE / SCHEDULED; one per
  // KST day for RECURRING / RANGE.
  runs: number;
  recipientEstimate: number;
  // Additive message counts: each run is a separate email to each recipient,
  // so summing runs gives the number of messages.
  sent: number;
  delivered: number;
  deliveryDelayed: number;
  totalOpens: number;
  totalClicks: number;
  bounced: number;
  bouncedPermanent: number;
  complained: number;
  failed: number;
  suppressed: number;
  // Sum of each run's unique count — "messages opened / clicked at least
  // once", NOT distinct people over the campaign: someone who clicks on two
  // days counts twice. Equal to the unique-recipient count only when runs = 1.
  // Distinct-recipient numbers across runs would need email-level data and
  // are deliberately not computed here.
  uniqueOpensPerRunSum: number;
  uniqueClicksPerRunSum: number;
  // Message-level rates over delivered messages (unique-per-run / delivered).
  // Open tracking undercounts (clients that block or proxy images, e.g. a
  // B2 open in Naver Mail never reached Resend), so openRate is a floor.
  // unique_clicks / unique_opens is never used: clicks can exist with 0 opens.
  openRate: number | null;
  clickRate: number | null;
  deliveryRate: number | null;
};

function emptyBroadcastTotals(): Omit<BroadcastCampaignStats, "openRate" | "clickRate" | "deliveryRate"> {
  return {
    runs: 0,
    recipientEstimate: 0,
    sent: 0,
    delivered: 0,
    deliveryDelayed: 0,
    totalOpens: 0,
    totalClicks: 0,
    bounced: 0,
    bouncedPermanent: 0,
    complained: 0,
    failed: 0,
    suppressed: 0,
    uniqueOpensPerRunSum: 0,
    uniqueClicksPerRunSum: 0,
  };
}

export function broadcastCampaignStats(runs: { run: BroadcastRunInput; stats: BroadcastStatsRow | null }[]): BroadcastCampaignStats {
  const t = emptyBroadcastTotals();
  for (const { run, stats } of runs) {
    if (broadcastRunOutcome(run, stats) !== "sent") continue;
    t.runs += 1;
    if (!stats) continue;
    t.recipientEstimate += stats.recipient_estimate ?? 0;
    t.sent += stats.sent;
    t.delivered += stats.delivered;
    t.deliveryDelayed += stats.delivery_delayed;
    t.totalOpens += stats.total_opens;
    t.totalClicks += stats.total_clicks;
    t.bounced += stats.bounced;
    t.bouncedPermanent += stats.bounced_permanent;
    t.complained += stats.complained;
    t.failed += stats.failed;
    t.suppressed += stats.suppressed;
    t.uniqueOpensPerRunSum += stats.unique_opens;
    t.uniqueClicksPerRunSum += stats.unique_clicks;
  }
  return {
    ...t,
    openRate: safeRatio(t.uniqueOpensPerRunSum, t.delivered),
    clickRate: safeRatio(t.uniqueClicksPerRunSum, t.delivered),
    deliveryRate: safeRatio(t.delivered, t.sent),
  };
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export type CampaignStatsInput = {
  campaign: { send_type: string; scheduled_at: string | null; total_sent: number | null };
  // This campaign's newsletter_deliveries rows (legacy path only writes them).
  legacyDeliveries: LegacyDeliveryInput[];
  // This campaign's newsletter_broadcast_sends rows with their stats row.
  broadcastRuns: { run: BroadcastRunInput; stats: BroadcastStatsRow | null }[];
};

export type CampaignStats = {
  path: DeliveryPath;
  // B2 test campaign (2099 marker) — callers can leave it out of analytics.
  isTestCampaign: boolean;
  // Each present only for a path that actually sent. Never combined: for
  // "mixed" both are filled and must be shown separately.
  legacy: LegacyCampaignStats | null;
  broadcast: BroadcastCampaignStats | null;
  // Broadcast runs that don't count as sent (see BroadcastRunOutcome).
  broadcastUnconfirmedRuns: number;
  broadcastAttemptOnlyRuns: number;
};

export function computeCampaignStats(input: CampaignStatsInput): CampaignStats {
  const outcomes = input.broadcastRuns.map(({ run, stats }) => broadcastRunOutcome(run, stats));
  const hasBroadcast = outcomes.includes("sent");
  const hasLegacy = input.legacyDeliveries.length > 0;
  const path: DeliveryPath = hasLegacy && hasBroadcast ? "mixed" : hasLegacy ? "legacy" : hasBroadcast ? "broadcast" : "none";

  // campaigns.total_sent is overwritten by every run of either path, so in a
  // mixed campaign it may describe a Broadcast run; the legacy part then
  // counts its own accepted rows instead.
  const legacy =
    path === "legacy"
      ? legacyCampaignStats(input.campaign.total_sent, input.legacyDeliveries)
      : path === "mixed"
        ? legacyAggregateStats(input.legacyDeliveries)
        : null;

  return {
    path,
    isTestCampaign: isBroadcastTestCampaign(input.campaign),
    legacy,
    broadcast: hasBroadcast ? broadcastCampaignStats(input.broadcastRuns) : null,
    broadcastUnconfirmedRuns: outcomes.filter((o) => o === "unconfirmed").length,
    broadcastAttemptOnlyRuns: outcomes.filter((o) => o === "attempt").length,
  };
}

// ---------------------------------------------------------------------------
// Admin analytics (analytics/page.tsx)
// ---------------------------------------------------------------------------

// B2 test campaigns are kept in the DB but left out of analytics.
export function isAnalyticsCampaign(campaign: { send_type: string; scheduled_at: string | null }): boolean {
  return !isBroadcastTestCampaign(campaign);
}

export type CampaignPerformanceInput = {
  // In display order (the page sorts by sent_at).
  campaigns: {
    id: string;
    name: string;
    newsletter_id: string;
    sent_at: string | null;
    send_type: string;
    scheduled_at: string | null;
    total_sent: number | null;
  }[];
  // Batch-loaded for all listed campaigns, grouped here by campaign_id.
  deliveries: (LegacyDeliveryInput & { campaign_id: string })[];
  broadcastRuns: (BroadcastRunInput & { campaign_id: string })[];
  broadcastStats: BroadcastStatsRow[];
};

export type CampaignPerformanceRow = {
  campaignId: string;
  name: string;
  newsletterId: string;
  sentAt: string | null;
  path: DeliveryPath;
  // null = not shown: a mixed campaign's two sources aren't summed into one
  // number, and "none" has nothing that was sent.
  //   legacy     campaigns.total_sent, opened / clicked over it (unchanged)
  //   broadcast  provider-confirmed sent; per-run unique opens / clicks over
  //              delivered (open rate is a floor, see BroadcastCampaignStats)
  sent: number | null;
  openRate: number | null;
  clickRate: number | null;
};

// One row per campaign of the "캠페인별 발송 성과" table, test campaigns left
// out, at most `limit` rows.
export function buildCampaignPerformanceRows(input: CampaignPerformanceInput, limit = Number.POSITIVE_INFINITY): CampaignPerformanceRow[] {
  const statsBySendId = new Map(input.broadcastStats.map((s) => [s.broadcast_send_id, s]));
  const group = <T extends { campaign_id: string }>(items: T[]) => {
    const map = new Map<string, T[]>();
    for (const item of items) map.set(item.campaign_id, [...(map.get(item.campaign_id) ?? []), item]);
    return map;
  };
  const deliveriesByCampaign = group(input.deliveries);
  const runsByCampaign = group(input.broadcastRuns);

  const rows: CampaignPerformanceRow[] = [];
  for (const campaign of input.campaigns) {
    if (rows.length >= limit) break;
    if (!isAnalyticsCampaign(campaign)) continue;

    const stats = computeCampaignStats({
      campaign,
      legacyDeliveries: deliveriesByCampaign.get(campaign.id) ?? [],
      broadcastRuns: (runsByCampaign.get(campaign.id) ?? []).map((run) => ({ run, stats: statsBySendId.get(run.id) ?? null })),
    });
    const shown =
      stats.path === "legacy" && stats.legacy
        ? { sent: stats.legacy.sent, openRate: stats.legacy.openRate, clickRate: stats.legacy.clickRate }
        : stats.path === "broadcast" && stats.broadcast
          ? { sent: stats.broadcast.sent, openRate: stats.broadcast.openRate, clickRate: stats.broadcast.clickRate }
          : { sent: null, openRate: null, clickRate: null };

    rows.push({ campaignId: campaign.id, name: campaign.name, newsletterId: campaign.newsletter_id, sentAt: campaign.sent_at, path: stats.path, ...shown });
  }
  return rows;
}

// Broadcast summary for the analytics cards: every counted Broadcast run of
// every analytics campaign (test campaigns out), with the same definitions as
// a campaign (BroadcastCampaignStats). Legacy is reported separately by the
// existing cards — the two are never merged into one rate. Mixed campaigns
// contribute their Broadcast runs only. null = no Broadcast has been sent.
export function broadcastSummaryStats(input: {
  campaigns: { id: string; send_type: string; scheduled_at: string | null }[];
  broadcastRuns: (BroadcastRunInput & { campaign_id: string })[];
  broadcastStats: BroadcastStatsRow[];
}): BroadcastCampaignStats | null {
  const included = new Set(input.campaigns.filter(isAnalyticsCampaign).map((c) => c.id));
  const statsBySendId = new Map(input.broadcastStats.map((s) => [s.broadcast_send_id, s]));
  const summary = broadcastCampaignStats(
    input.broadcastRuns.filter((run) => included.has(run.campaign_id)).map((run) => ({ run, stats: statsBySendId.get(run.id) ?? null })),
  );
  return summary.runs > 0 ? summary : null;
}

// One row of newsletter_daily_send_counts (migration 0033), as PostgREST
// returns it: emails sent per UTC day, already aggregated in the database —
// legacy per day, Broadcast per (run, day). See the migration for the rules
// (window, PROCESSED email.sent only, distinct email_id, event time).
export type DailySendCountRow = {
  source: "legacy" | "broadcast";
  broadcast_send_id: string | null;
  send_date: string; // YYYY-MM-DD, UTC
  sent_count: number | string; // bigint
};

// Emails sent per day ("YYYY-MM-DD" → count) for the daily volume chart:
//   legacy     subscriber delivery rows (the function already leaves out
//              promotional ones)
//   broadcast  only runs of analytics campaigns — B2 test campaigns,
//              unknown runs and runs of campaigns not passed in are dropped
//              here, with the same predicate as the rest of the page
// The two can be added: legacy mail never carries a broadcast id (its events
// are IGNORED and unlinked) and Broadcast runs write no delivery rows, so no
// email is in both.
export function dailySendCounts(input: {
  rows: DailySendCountRow[];
  broadcastRuns: { id: string; campaign_id: string }[];
  campaigns: { id: string; send_type: string; scheduled_at: string | null }[];
}): Map<string, number> {
  const included = new Set(input.campaigns.filter(isAnalyticsCampaign).map((c) => c.id));
  const campaignBySendId = new Map(input.broadcastRuns.map((r) => [r.id, r.campaign_id]));

  const counts = new Map<string, number>();
  for (const row of input.rows) {
    if (row.source === "broadcast") {
      const campaignId = row.broadcast_send_id ? campaignBySendId.get(row.broadcast_send_id) : undefined;
      if (!campaignId || !included.has(campaignId)) continue;
    } else if (row.source !== "legacy") {
      continue;
    }
    const n = Number(row.sent_count);
    if (!Number.isFinite(n) || n <= 0) continue;
    counts.set(row.send_date, (counts.get(row.send_date) ?? 0) + n);
  }
  return counts;
}

// The chart's day keys, oldest first: the last `days` days ending today, as
// "YYYY-MM-DD" from the ISO (UTC) string — how the page has always keyed
// its buckets.
export function trendDayKeys(days: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}
