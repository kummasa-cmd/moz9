import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  broadcastCampaignStats,
  broadcastSummaryStats,
  dailySendCounts,
  buildCampaignPerformanceRows,
  isAnalyticsCampaign,
  broadcastRunOutcome,
  computeCampaignStats,
  legacyAggregateStats,
  legacyCampaignStats,
  safeRatio,
  trendDayKeys,
  type BroadcastRunInput,
  type DailySendCountRow,
  type BroadcastStatsRow,
  type LegacyDeliveryInput,
} from "./campaign-stats";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ONE_OFF = { send_type: "IMMEDIATE", scheduled_at: null };
const B2 = { send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" };

function delivery(status: string, opened = false): LegacyDeliveryInput {
  return { status, sent_at: status === "FAILED" || status === "QUEUED" ? null : "2026-10-01T00:34:00Z", opened_at: opened ? "2026-10-01T01:00:00Z" : null };
}

function deliveries(spec: { sent?: number; opened?: number; clicked?: number; failed?: number }): LegacyDeliveryInput[] {
  return [
    ...Array.from({ length: spec.sent ?? 0 }, () => delivery("SENT")),
    ...Array.from({ length: spec.opened ?? 0 }, () => delivery("OPENED", true)),
    // The click route sets opened_at too.
    ...Array.from({ length: spec.clicked ?? 0 }, () => delivery("CLICKED", true)),
    ...Array.from({ length: spec.failed ?? 0 }, () => delivery("FAILED")),
  ];
}

function run(id: string, overrides: Partial<BroadcastRunInput> = {}): BroadcastRunInput {
  return { id, run_key: "once", status: "SEND_REQUESTED", resend_broadcast_id: `bc-${id}`, ...overrides };
}

function stats(id: string, overrides: Partial<BroadcastStatsRow> = {}): BroadcastStatsRow {
  return {
    broadcast_send_id: id,
    recipient_estimate: 1,
    sent: 0,
    delivered: 0,
    delivery_delayed: 0,
    unique_opens: 0,
    total_opens: 0,
    unique_clicks: 0,
    total_clicks: 0,
    bounced: 0,
    bounced_permanent: 0,
    complained: 0,
    failed: 0,
    suppressed: 0,
    ...overrides,
  };
}

// The 2nd B2 (Tracking) run as measured in Production: Naver never reported
// the open, the click came through.
const B2_TRACKING = stats("75b7e07b", { sent: 1, delivered: 1, unique_opens: 0, total_opens: 0, unique_clicks: 1, total_clicks: 1 });

// ---------------------------------------------------------------------------

describe("safeRatio", () => {
  it("divides normally", () => assert.equal(safeRatio(1, 4), 0.25));
  it("returns null (not NaN / Infinity) for a zero or invalid denominator", () => {
    assert.equal(safeRatio(0, 0), null);
    assert.equal(safeRatio(3, 0), null);
    assert.equal(safeRatio(1, -1), null);
    assert.equal(safeRatio(Number.NaN, 2), null);
    assert.equal(safeRatio(1, Number.POSITIVE_INFINITY), null);
  });
});

describe("legacy campaign — same numbers as analytics/page.tsx", () => {
  it("no Broadcast runs → path legacy, opened/clicked over campaigns.total_sent", () => {
    const s = computeCampaignStats({
      campaign: { ...ONE_OFF, total_sent: 10 },
      legacyDeliveries: deliveries({ sent: 6, opened: 2, clicked: 2 }),
      broadcastRuns: [],
    });
    assert.equal(s.path, "legacy");
    assert.equal(s.broadcast, null);
    // opened = opened_at rows (OPENED + CLICKED), clicked = CLICKED rows.
    assert.deepEqual(s.legacy, { sent: 10, opened: 4, clicked: 2, openRate: 0.4, clickRate: 0.2 });
  });

  it("per-campaign rates use total_sent even when rows differ (page behaviour kept)", () => {
    const s = legacyCampaignStats(5, deliveries({ sent: 3, clicked: 1, failed: 2 }));
    assert.equal(s.sent, 5);
    assert.equal(s.clickRate, 0.2);
  });

  it("total_sent 0 or null → rates null, never NaN", () => {
    for (const total of [0, null]) {
      const s = legacyCampaignStats(total, deliveries({ failed: 3 }));
      assert.equal(s.openRate, null);
      assert.equal(s.clickRate, null);
    }
  });

  it("summary cards: denominator is rows with sent_at (FAILED / QUEUED excluded)", () => {
    const s = legacyAggregateStats(deliveries({ sent: 7, opened: 2, clicked: 1, failed: 5 }));
    assert.equal(s.sent, 10);
    assert.equal(s.opened, 3);
    assert.equal(s.clicked, 1);
    assert.equal(s.openRate, 0.3);
    assert.equal(s.clickRate, 0.1);
    assert.equal(legacyAggregateStats([]).openRate, null);
  });
});

describe("broadcast campaign — one-off", () => {
  it("B2 Tracking: sent 1 / delivered 1 / open 0 / click 1 → open 0%, click 100%", () => {
    const s = computeCampaignStats({
      campaign: { ...B2, total_sent: 1 },
      legacyDeliveries: [],
      broadcastRuns: [{ run: run("75b7e07b"), stats: B2_TRACKING }],
    });
    assert.equal(s.path, "broadcast");
    assert.equal(s.legacy, null);
    const b = s.broadcast!;
    assert.equal(b.runs, 1);
    assert.equal(b.sent, 1);
    assert.equal(b.delivered, 1);
    assert.equal(b.uniqueOpensPerRunSum, 0);
    assert.equal(b.uniqueClicksPerRunSum, 1);
    assert.equal(b.openRate, 0);
    assert.equal(b.clickRate, 1);
    assert.equal(b.deliveryRate, 1);
  });

  it("delivered 0 (events not in yet) → rates null", () => {
    const b = broadcastCampaignStats([{ run: run("r1"), stats: stats("r1", { sent: 1 }) }]);
    assert.equal(b.openRate, null);
    assert.equal(b.clickRate, null);
    assert.equal(b.deliveryRate, 0);
  });

  it("sent but no stats row yet still counts as a Broadcast run, with zero numbers", () => {
    const s = computeCampaignStats({ campaign: { ...ONE_OFF, total_sent: 92 }, legacyDeliveries: [], broadcastRuns: [{ run: run("r1"), stats: null }] });
    assert.equal(s.path, "broadcast");
    assert.equal(s.broadcast!.runs, 1);
    assert.equal(s.broadcast!.sent, 0);
    assert.equal(s.broadcast!.clickRate, null);
  });

  it("all view counters are carried through", () => {
    const b = broadcastCampaignStats([
      {
        run: run("r1"),
        stats: stats("r1", { recipient_estimate: 92, sent: 92, delivered: 88, delivery_delayed: 1, bounced: 2, bounced_permanent: 1, complained: 1, failed: 1, suppressed: 1, total_opens: 40, total_clicks: 12 }),
      },
    ]);
    assert.deepEqual(
      [b.recipientEstimate, b.sent, b.delivered, b.deliveryDelayed, b.bounced, b.bouncedPermanent, b.complained, b.failed, b.suppressed, b.totalOpens, b.totalClicks],
      [92, 92, 88, 1, 2, 1, 1, 1, 1, 40, 12],
    );
  });
});

describe("broadcast campaign — several runs (RECURRING / RANGE)", () => {
  const runs = [
    { run: run("d1", { run_key: "2026-10-01" }), stats: stats("d1", { recipient_estimate: 90, sent: 90, delivered: 88, unique_opens: 20, total_opens: 30, unique_clicks: 8, total_clicks: 10 }) },
    { run: run("d2", { run_key: "2026-10-02" }), stats: stats("d2", { recipient_estimate: 92, sent: 92, delivered: 90, unique_opens: 25, total_opens: 31, unique_clicks: 9, total_clicks: 9 }) },
  ];

  it("message counts add up across runs", () => {
    const b = broadcastCampaignStats(runs);
    assert.equal(b.runs, 2);
    assert.equal(b.recipientEstimate, 182);
    assert.equal(b.sent, 182);
    assert.equal(b.delivered, 178);
    assert.equal(b.totalOpens, 61);
    assert.equal(b.totalClicks, 19);
  });

  it("unique counts are a per-run sum (messages, not distinct people) and rates are per delivered message", () => {
    const b = broadcastCampaignStats(runs);
    // The same reader clicking on both days is counted twice — by design;
    // the field name says so and the rate is over delivered messages.
    assert.equal(b.uniqueOpensPerRunSum, 45);
    assert.equal(b.uniqueClicksPerRunSum, 17);
    assert.equal(b.openRate, 45 / 178);
    assert.equal(b.clickRate, 17 / 178);
    assert.equal("uniqueClicks" in b, false, "no field that reads as distinct people");
  });
});

describe("mixed campaign (legacy days + Broadcast days)", () => {
  const input = {
    campaign: { send_type: "RECURRING", scheduled_at: null, total_sent: 92 }, // last run (Broadcast) wrote it
    legacyDeliveries: deliveries({ sent: 80, opened: 5, clicked: 5 }),
    broadcastRuns: [{ run: run("d3", { run_key: "2026-10-03" }), stats: stats("d3", { sent: 92, delivered: 91, unique_clicks: 4, total_clicks: 4 }) }],
  };

  it("is reported as mixed with both parts, side by side", () => {
    const s = computeCampaignStats(input);
    assert.equal(s.path, "mixed");
    assert.ok(s.legacy && s.broadcast);
  });

  it("never adds the two sources", () => {
    const s = computeCampaignStats(input);
    // Legacy part counts its own accepted rows, not the Broadcast-written total_sent.
    assert.equal(s.legacy!.sent, 90);
    assert.equal(s.legacy!.clicked, 5);
    assert.equal(s.broadcast!.sent, 92);
    assert.equal(s.broadcast!.uniqueClicksPerRunSum, 4);
    assert.deepEqual(Object.keys(s).sort(), ["broadcast", "broadcastAttemptOnlyRuns", "broadcastUnconfirmedRuns", "isTestCampaign", "legacy", "path"]);
  });
});

describe("failed / unconfirmed Broadcast runs", () => {
  it("FAILED with no Resend Broadcast is an attempt only, not a Broadcast campaign", () => {
    const attempt = run("r1", { status: "FAILED", resend_broadcast_id: null });
    assert.equal(broadcastRunOutcome(attempt, stats("r1")), "attempt");
    const s = computeCampaignStats({ campaign: { ...ONE_OFF, total_sent: 0 }, legacyDeliveries: [], broadcastRuns: [{ run: attempt, stats: stats("r1") }] });
    assert.equal(s.path, "none");
    assert.equal(s.broadcast, null);
    assert.equal(s.broadcastAttemptOnlyRuns, 1);
  });

  it("CREATING without an id is an attempt", () => {
    assert.equal(broadcastRunOutcome(run("r1", { status: "CREATING", resend_broadcast_id: null }), null), "attempt");
  });

  it("DRAFT / FAILED-after-draft with no events is unconfirmed, not sent", () => {
    for (const status of ["DRAFT", "FAILED"]) {
      const r = run("r1", { status });
      assert.equal(broadcastRunOutcome(r, stats("r1")), "unconfirmed");
      const s = computeCampaignStats({ campaign: { ...ONE_OFF, total_sent: 0 }, legacyDeliveries: [], broadcastRuns: [{ run: r, stats: stats("r1") }] });
      assert.equal(s.path, "none");
      assert.equal(s.broadcastUnconfirmedRuns, 1);
    }
  });

  it("provider events prove a send even if our row never reached SEND_REQUESTED", () => {
    assert.equal(broadcastRunOutcome(run("r1", { status: "DRAFT" }), stats("r1", { sent: 1 })), "sent");
  });

  it("a failed retry next to a sent run doesn't change the totals", () => {
    const b = broadcastCampaignStats([
      { run: run("ok"), stats: stats("ok", { sent: 5, delivered: 5, unique_clicks: 1 }) },
      { run: run("bad", { run_key: "2026-10-02", status: "FAILED", resend_broadcast_id: null }), stats: stats("bad", { recipient_estimate: 99 }) },
    ]);
    assert.equal(b.runs, 1);
    assert.equal(b.recipientEstimate, 1);
    assert.equal(b.sent, 5);
  });
});

describe("B2 test campaigns", () => {
  it("the 2099 marker is flagged", () => {
    const s = computeCampaignStats({ campaign: { ...B2, total_sent: 1 }, legacyDeliveries: [], broadcastRuns: [{ run: run("r"), stats: B2_TRACKING }] });
    assert.equal(s.isTestCampaign, true);
  });

  it("ordinary campaigns are not", () => {
    for (const campaign of [
      { send_type: "SCHEDULED", scheduled_at: "2026-10-01T00:30:00+00:00" },
      { send_type: "IMMEDIATE", scheduled_at: null },
      { send_type: "RECURRING", scheduled_at: "2099-12-31T00:00:00+00:00" }, // marker only counts on SCHEDULED
      { send_type: "SCHEDULED", scheduled_at: "2099-12-30T00:00:00+00:00" },
    ]) {
      const s = computeCampaignStats({ campaign: { ...campaign, total_sent: 10 }, legacyDeliveries: deliveries({ sent: 10 }), broadcastRuns: [] });
      assert.equal(s.isTestCampaign, false, JSON.stringify(campaign));
    }
  });
});

// ---------------------------------------------------------------------------
// Admin analytics table (analytics/page.tsx → buildCampaignPerformanceRows)
// ---------------------------------------------------------------------------

describe("buildCampaignPerformanceRows", () => {
  type Campaign = Parameters<typeof buildCampaignPerformanceRows>[0]["campaigns"][number];
  const campaign = (id: string, overrides: Partial<Campaign> = {}): Campaign => ({
    id,
    name: `캠페인 ${id}`,
    newsletter_id: `nl-${id}`,
    sent_at: "2026-10-01T00:34:00Z",
    send_type: "IMMEDIATE",
    scheduled_at: null,
    total_sent: 10,
    ...overrides,
  });
  const tag = <T extends object>(campaignId: string, items: T[]) => items.map((i) => ({ ...i, campaign_id: campaignId }));

  it("legacy rows keep the page's numbers (total_sent; opened / clicked over it)", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("L", { total_sent: 97 })],
      deliveries: tag("L", deliveries({ sent: 66, opened: 22, clicked: 9 })),
      broadcastRuns: [],
      broadcastStats: [],
    });
    assert.equal(row.path, "legacy");
    assert.equal(row.sent, 97);
    assert.equal(row.openRate, 31 / 97);
    assert.equal(row.clickRate, 9 / 97);
  });

  it("a Broadcast one-off shows provider sent and rates over delivered (B2-T: 1 / 0% / 100%)", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("B", { total_sent: 92 })], // total_sent is the estimate — not shown
      deliveries: [],
      broadcastRuns: tag("B", [run("75b7e07b")]),
      broadcastStats: [B2_TRACKING],
    });
    assert.equal(row.path, "broadcast");
    assert.equal(row.sent, 1);
    assert.equal(row.openRate, 0);
    assert.equal(row.clickRate, 1);
  });

  it("B2 test campaigns are left out (shared predicate), real ones kept in order", () => {
    const rows = buildCampaignPerformanceRows({
      campaigns: [campaign("T", { send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" }), campaign("R")],
      deliveries: tag("R", deliveries({ sent: 10 })),
      broadcastRuns: tag("T", [run("t1")]),
      broadcastStats: [B2_TRACKING],
    });
    assert.deepEqual(rows.map((r) => r.campaignId), ["R"]);
    assert.equal(isAnalyticsCampaign({ send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" }), false);
    assert.equal(isAnalyticsCampaign({ send_type: "SCHEDULED", scheduled_at: "2026-10-01T00:30:00+00:00" }), true);
  });

  it("the limit counts real campaigns only (test ones don't use up rows)", () => {
    const test = (id: string) => campaign(id, { send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00Z" });
    const rows = buildCampaignPerformanceRows(
      { campaigns: [test("t1"), campaign("a"), test("t2"), campaign("b"), campaign("c")], deliveries: [], broadcastRuns: [], broadcastStats: [] },
      2,
    );
    assert.deepEqual(rows.map((r) => r.campaignId), ["a", "b"]);
  });

  it("mixed shows no sent / open / click (sources never summed)", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("M", { send_type: "RECURRING", total_sent: 92 })],
      deliveries: tag("M", deliveries({ sent: 80, clicked: 5 })),
      broadcastRuns: tag("M", [run("m1", { run_key: "2026-10-03" })]),
      broadcastStats: [stats("m1", { sent: 92, delivered: 91, unique_clicks: 4 })],
    });
    assert.equal(row.path, "mixed");
    assert.equal(row.sent, null);
    assert.equal(row.openRate, null);
    assert.equal(row.clickRate, null);
  });

  it("none (only a failed attempt) shows nothing instead of pretending to be legacy", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("N", { total_sent: 92 })],
      deliveries: [],
      broadcastRuns: tag("N", [run("n1", { status: "FAILED", resend_broadcast_id: null })]),
      broadcastStats: [stats("n1")],
    });
    assert.equal(row.path, "none");
    assert.deepEqual([row.sent, row.openRate, row.clickRate], [null, null, null]);
  });

  it("right after SEND_REQUESTED (no stats row yet) → broadcast, sent 0, rates '-'", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("S", { total_sent: 92 })],
      deliveries: [],
      broadcastRuns: tag("S", [run("s1")]),
      broadcastStats: [],
    });
    assert.equal(row.path, "broadcast");
    assert.equal(row.sent, 0);
    assert.equal(row.openRate, null);
    assert.equal(row.clickRate, null);
  });

  it("legacy with total_sent 0 → rates null", () => {
    const [row] = buildCampaignPerformanceRows({ campaigns: [campaign("Z", { total_sent: 0 })], deliveries: tag("Z", deliveries({ failed: 2 })), broadcastRuns: [], broadcastStats: [] });
    assert.equal(row.path, "legacy");
    assert.equal(row.openRate, null);
    assert.equal(row.clickRate, null);
  });

  it("several Broadcast runs of one campaign are summed (per-run unique)", () => {
    const [row] = buildCampaignPerformanceRows({
      campaigns: [campaign("R2", { send_type: "RECURRING" })],
      deliveries: [],
      broadcastRuns: tag("R2", [run("d1", { run_key: "2026-10-01" }), run("d2", { run_key: "2026-10-02" })]),
      broadcastStats: [stats("d1", { sent: 90, delivered: 88, unique_opens: 20, unique_clicks: 8 }), stats("d2", { sent: 92, delivered: 90, unique_opens: 25, unique_clicks: 9 })],
    });
    assert.equal(row.sent, 182);
    assert.equal(row.openRate, 45 / 178);
    assert.equal(row.clickRate, 17 / 178);
  });

  it("rows of one campaign never pick up another campaign's deliveries or runs", () => {
    const rows = buildCampaignPerformanceRows({
      campaigns: [campaign("A", { total_sent: 4 }), campaign("B")],
      deliveries: tag("A", deliveries({ clicked: 2, sent: 2 })),
      broadcastRuns: tag("B", [run("b1")]),
      broadcastStats: [stats("b1", { sent: 3, delivered: 3, unique_clicks: 3 })],
    });
    assert.deepEqual(rows.map((r) => [r.campaignId, r.path, r.sent, r.clickRate]), [["A", "legacy", 4, 0.5], ["B", "broadcast", 3, 1]]);
  });
});

// ---------------------------------------------------------------------------
// Stage 5-3: Broadcast summary cards and the daily volume chart
// ---------------------------------------------------------------------------

describe("broadcastSummaryStats", () => {
  const real = { id: "C", send_type: "IMMEDIATE", scheduled_at: null };
  const test = { id: "T", send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" };
  const withCampaign = (campaignId: string, r: BroadcastRunInput) => ({ ...r, campaign_id: campaignId });

  it("one real Broadcast campaign → delivery / open / click over its runs", () => {
    const s = broadcastSummaryStats({
      campaigns: [real],
      broadcastRuns: [withCampaign("C", run("c1"))],
      broadcastStats: [stats("c1", { sent: 92, delivered: 90, unique_opens: 30, unique_clicks: 9 })],
    })!;
    assert.equal(s.deliveryRate, 90 / 92);
    assert.equal(s.openRate, 30 / 90);
    assert.equal(s.clickRate, 9 / 90);
  });

  it("B2 test campaigns are excluded — B2 alone means no data (null), not 0%", () => {
    assert.equal(
      broadcastSummaryStats({ campaigns: [test], broadcastRuns: [withCampaign("T", run("t1"))], broadcastStats: [B2_TRACKING] }),
      null,
    );
  });

  it("no Broadcast at all → null", () => {
    assert.equal(broadcastSummaryStats({ campaigns: [real], broadcastRuns: [], broadcastStats: [] }), null);
  });

  it("B2 fixture treated as a real campaign → delivery 100%, open 0%, click 100%", () => {
    const s = broadcastSummaryStats({ campaigns: [real], broadcastRuns: [withCampaign("C", run("75b7e07b"))], broadcastStats: [B2_TRACKING] })!;
    assert.deepEqual([s.deliveryRate, s.openRate, s.clickRate], [1, 0, 1]);
  });

  it("sent run with no events yet → rates null (denominator 0)", () => {
    const s = broadcastSummaryStats({ campaigns: [real], broadcastRuns: [withCampaign("C", run("c1"))], broadcastStats: [] })!;
    assert.equal(s.runs, 1);
    assert.deepEqual([s.deliveryRate, s.openRate, s.clickRate], [null, null, null]);
  });

  it("several runs and campaigns add up; test runs and failed attempts don't", () => {
    const s = broadcastSummaryStats({
      campaigns: [real, { id: "D", send_type: "RECURRING", scheduled_at: null }, test],
      broadcastRuns: [
        withCampaign("C", run("c1")),
        withCampaign("D", run("d1", { run_key: "2026-10-01" })),
        withCampaign("D", run("d2", { run_key: "2026-10-02", status: "FAILED", resend_broadcast_id: null })),
        withCampaign("T", run("t1")),
      ],
      broadcastStats: [
        stats("c1", { sent: 10, delivered: 10, unique_clicks: 2 }),
        stats("d1", { sent: 20, delivered: 18, unique_clicks: 3 }),
        stats("d2", { sent: 0 }),
        B2_TRACKING,
      ],
    })!;
    assert.equal(s.runs, 2);
    assert.equal(s.sent, 30);
    assert.equal(s.delivered, 28);
    assert.equal(s.uniqueClicksPerRunSum, 5);
  });
});

describe("dailySendCounts (날짜별 발송량, DB 집계 행)", () => {
  const campaigns = [
    { id: "B", send_type: "IMMEDIATE", scheduled_at: null },
    { id: "M", send_type: "RECURRING", scheduled_at: null },
    { id: "T", send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" },
  ];
  const runs = [
    { id: "b1", campaign_id: "B" },
    { id: "m1", campaign_id: "M" },
    { id: "t1", campaign_id: "T" },
  ];
  const legacy = (date: string, n: number | string): DailySendCountRow => ({ source: "legacy", broadcast_send_id: null, send_date: date, sent_count: n });
  const broadcast = (sendId: string | null, date: string, n: number | string): DailySendCountRow => ({ source: "broadcast", broadcast_send_id: sendId, send_date: date, sent_count: n });
  const counts = (rows: DailySendCountRow[]) => Object.fromEntries(dailySendCounts({ rows, broadcastRuns: runs, campaigns }));

  it("legacy only", () => {
    assert.deepEqual(counts([legacy("2026-10-01", 97), legacy("2026-09-29", 90)]), { "2026-10-01": 97, "2026-09-29": 90 });
  });

  it("first real Broadcast: the day counts emails sent (107), not delivered", () => {
    assert.deepEqual(counts([broadcast("b1", "2026-10-06", 107)]), { "2026-10-06": 107 });
  });

  it("same day legacy + Broadcast add up (50 + 108 = 158); different days stay apart", () => {
    assert.deepEqual(counts([legacy("2026-10-05", 50), broadcast("b1", "2026-10-05", 108), legacy("2026-10-04", 3)]), {
      "2026-10-05": 158,
      "2026-10-04": 3,
    });
  });

  it("a mixed campaign's legacy day and Broadcast day are both counted, each once", () => {
    assert.deepEqual(counts([legacy("2026-10-01", 1), broadcast("m1", "2026-10-02", 1)]), { "2026-10-01": 1, "2026-10-02": 1 });
  });

  it("B2 test campaign runs, unknown runs and unlinked rows are left out", () => {
    assert.deepEqual(counts([broadcast("t1", "2026-10-03", 1), broadcast("zz", "2026-10-03", 5), broadcast(null, "2026-10-03", 7)]), {});
  });

  it("runs of campaigns not passed in (promo, unsent) are left out", () => {
    const rows = [broadcast("b1", "2026-10-06", 10)];
    assert.deepEqual(Object.fromEntries(dailySendCounts({ rows, broadcastRuns: runs, campaigns: [] })), {});
  });

  it("bigint counts that arrive as strings are added as numbers", () => {
    assert.deepEqual(counts([broadcast("b1", "2026-10-06", "60"), broadcast("b1", "2026-10-06", "48")]), { "2026-10-06": 108 });
  });

  it("ignores unknown sources and empty / invalid counts", () => {
    const odd = { source: "other", broadcast_send_id: null, send_date: "2026-10-06", sent_count: 9 } as unknown as DailySendCountRow;
    assert.deepEqual(counts([odd, legacy("2026-10-06", 0), legacy("2026-10-06", "x")]), {});
  });
});

describe("trendDayKeys", () => {
  it("the last N UTC days ending today, oldest first", () => {
    const keys = trendDayKeys(30, new Date("2026-10-06T00:13:14Z"));
    assert.equal(keys.length, 30);
    assert.equal(keys[0], "2026-09-07");
    assert.equal(keys[29], "2026-10-06");
  });
});
