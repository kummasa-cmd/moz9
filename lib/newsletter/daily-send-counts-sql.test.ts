import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { dailySendCounts, trendDayKeys, type DailySendCountRow } from "./campaign-stats";

// Runs the real 0033 migration (on top of 0029) on an in-process Postgres
// and checks newsletter_daily_send_counts — the admin trend chart's data —
// against the meaning the chart had when it bucketed raw rows in the app.

const MIGRATION_0029 = readFileSync(join(process.cwd(), "supabase/migrations/0029_newsletter_resend_webhook_events.sql"), "utf8");
const MIGRATION_0033 = readFileSync(join(process.cwd(), "supabase/migrations/0033_newsletter_daily_send_counts.sql"), "utf8");
const PAGE = readFileSync(join(process.cwd(), "app/admin/(protected)/site/newsletter/analytics/page.tsx"), "utf8");

// Just enough of the existing schema (0005 / 0024 / 0027 / 0028) for 0029 and 0033.
const PREREQUISITES = `
  create role anon; create role authenticated; create role service_role;
  create table public.newsletters (id uuid primary key default gen_random_uuid());
  create table public.newsletter_campaigns (id uuid primary key default gen_random_uuid());
  create table public.newsletter_subscribers (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    name text,
    member_id uuid,
    source text not null default 'MANUAL',
    status text not null default 'SUBSCRIBED' check (status in ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED')),
    tags text[] not null default '{}',
    subscribed_at timestamptz not null default now(),
    unsubscribed_at timestamptz,
    resend_contact_id text,
    resend_synced_at timestamptz,
    resend_sync_error text
  );
  create table public.newsletter_suppressions (
    id uuid primary key default gen_random_uuid(),
    email text not null unique,
    unsubscribed_at timestamptz not null default now()
  );
  create table public.newsletter_broadcast_sends (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.newsletter_campaigns (id),
    newsletter_id uuid not null references public.newsletters (id),
    run_key text not null,
    resend_broadcast_id text unique,
    recipient_estimate int
  );
  create table public.newsletter_deliveries (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid references public.newsletter_campaigns (id),
    subscriber_id uuid,
    prospect_id uuid,
    sent_at timestamptz
  );
`;

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(PREREQUISITES);
  await db.exec(MIGRATION_0029);
  await db.exec(MIGRATION_0033);
  // Safe to run more than once.
  await db.exec(MIGRATION_0033);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    set timezone = 'UTC';
    delete from public.newsletter_webhook_events;
    delete from public.newsletter_deliveries;
    delete from public.newsletter_broadcast_sends;
    delete from public.newsletter_campaigns;
    delete from public.newsletters;
  `);
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Campaign = { id: string; send_type: string; scheduled_at: string | null };
type Run = { id: string; campaign_id: string };

const REGULAR = { send_type: "SCHEDULED", scheduled_at: "2026-10-06T00:00:00Z" };
const B2 = { send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00+00:00" };

async function createRun(campaign: { send_type: string; scheduled_at: string | null }): Promise<{ campaign: Campaign; run: Run }> {
  const { rows } = await db.query<{ campaign_id: string; run_id: string }>(`
    with c as (insert into public.newsletter_campaigns default values returning id),
         n as (insert into public.newsletters default values returning id)
    insert into public.newsletter_broadcast_sends (campaign_id, newsletter_id, run_key)
    select c.id, n.id, 'once' from c, n
    returning campaign_id, id as run_id
  `);
  const { campaign_id, run_id } = rows[0];
  return { campaign: { id: campaign_id, ...campaign }, run: { id: run_id, campaign_id } };
}

let svix = 0;
type EventInput = {
  runId: string | null;
  emailId: string | null;
  type?: string;
  status?: string;
  at: string | null; // event_created_at
  receivedAt?: string;
};

async function insertEvents(events: EventInput[]) {
  for (const e of events) {
    await db.query(
      `insert into public.newsletter_webhook_events
         (svix_id, event_type, status, broadcast_send_id, email_id, event_created_at, received_at)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [`svix-${++svix}`, e.type ?? "email.sent", e.status ?? "PROCESSED", e.runId, e.emailId, e.at, e.receivedAt ?? e.at ?? "2026-10-06T00:00:00Z"],
    );
  }
}

// `count` recipients of one run, all sent at `at` (+ i ms), in one statement.
async function bulkSent(runId: string, count: number, at: string, tag: string) {
  await db.query(
    `insert into public.newsletter_webhook_events
       (svix_id, event_type, status, broadcast_send_id, email_id, event_created_at, received_at)
     select $4 || '-svix-' || g, 'email.sent', 'PROCESSED', $1::uuid, $4 || '-email-' || g,
            $2::timestamptz + g * interval '1 millisecond', $2::timestamptz + g * interval '1 millisecond' + interval '2 seconds'
     from generate_series(1, $3::int) g`,
    [runId, at, count, tag],
  );
}

async function insertLegacy(count: number, sentAt: string, opts: { promo?: boolean } = {}) {
  await db.query(
    `insert into public.newsletter_deliveries (subscriber_id, prospect_id, sent_at)
     select case when $3 then null else gen_random_uuid() end,
            case when $3 then gen_random_uuid() else null end,
            $2::timestamptz
     from generate_series(1, $1::int)`,
    [count, sentAt, opts.promo ?? false],
  );
}

async function rpc(since: string): Promise<DailySendCountRow[]> {
  const { rows } = await db.query<DailySendCountRow & { send_date: Date | string }>(
    "select source, broadcast_send_id, send_date::text as send_date, sent_count from public.newsletter_daily_send_counts($1)",
    [since],
  );
  return rows.map((r) => ({ ...r, send_date: String(r.send_date), sent_count: Number(r.sent_count) }));
}

// The chart series exactly as the page builds it from the function's rows.
function chart(rows: DailySendCountRow[], runs: Run[], campaigns: Campaign[], now: Date, days = 30) {
  const counts = dailySendCounts({ rows, broadcastRuns: runs, campaigns });
  return trendDayKeys(days, now).map((date) => ({ date, count: counts.get(date) ?? 0 }));
}

const nonZero = (series: { date: string; count: number }[]) => Object.fromEntries(series.filter((d) => d.count > 0).map((d) => [d.date, d.count]));
const total = (series: { count: number }[]) => series.reduce((sum, d) => sum + d.count, 0);

// Weekdays (Mon–Fri) in [from, to], as YYYY-MM-DD.
function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("newsletter_daily_send_counts — production fixture", () => {
  it("first real Broadcast: 107 sent / 106 delivered / 1 transient bounce → the day shows 107; B2 left out", async () => {
    const real = await createRun(REGULAR);
    const b2 = await createRun(B2);
    await bulkSent(real.run.id, 107, "2026-10-06T00:00:34Z", "first");
    await db.query(
      `insert into public.newsletter_webhook_events (svix_id, event_type, status, broadcast_send_id, email_id, event_created_at)
       select 'dlv-' || g, 'email.delivered', 'PROCESSED', $1::uuid, 'first-email-' || g, '2026-10-06T00:01:00Z' from generate_series(1, 106) g`,
      [real.run.id],
    );
    await insertEvents([
      { runId: real.run.id, emailId: "first-email-107", type: "email.bounced", at: "2026-10-06T00:01:00Z" },
      { runId: real.run.id, emailId: "first-email-1", type: "email.opened", at: "2026-10-06T00:05:00Z" },
      { runId: b2.run.id, emailId: "b2-1", at: "2026-10-03T08:14:30Z" },
      { runId: b2.run.id, emailId: "b2-2", at: "2026-10-03T08:50:19Z" },
    ]);
    await insertLegacy(97, "2026-10-01T00:34:00Z");

    const now = new Date("2026-10-06T00:13:14Z");
    const series = chart(await rpc("2026-09-07T00:13:14Z"), [real.run, b2.run], [real.campaign, b2.campaign], now);
    assert.deepEqual(nonZero(series), { "2026-10-01": 97, "2026-10-06": 107 });
  });
});

describe("newsletter_daily_send_counts — volume beyond PostgREST's 1000-row cap", () => {
  async function weekdaySends(subscribers: number) {
    const days = weekdays("2026-09-07", "2026-10-06").slice(-22);
    assert.equal(days.length, 22);
    const campaigns: Campaign[] = [];
    const runs: Run[] = [];
    for (const [i, day] of days.entries()) {
      const { campaign, run } = await createRun(REGULAR);
      campaigns.push(campaign);
      runs.push(run);
      await bulkSent(run.id, subscribers, `${day}T00:00:30Z`, `d${i}`);
    }
    return { days, campaigns, runs };
  }

  it("108 subscribers × 22 weekday issues = 2,376 email.sent → 22 rows, 108 each, total 2,376", async () => {
    const { days, campaigns, runs } = await weekdaySends(108);
    const { rows: raw } = await db.query<{ n: number }>("select count(*)::int as n from public.newsletter_webhook_events");
    assert.equal(raw[0].n, 2376);

    // Window opens before the oldest issue (an issue sent before `since` on
    // the oldest chart day is outside it, as before).
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.equal(rows.length, 22, "one row per (run, day), not per email");

    const series = chart(rows, runs, campaigns, new Date("2026-10-06T23:00:00Z"));
    assert.deepEqual(nonZero(series), Object.fromEntries(days.map((d) => [d, 108])));
    assert.equal(total(series), 2376);
  });

  it("500 subscribers × 22 = 11,000 email.sent → still 22 rows, total 11,000", async () => {
    const { days, campaigns, runs } = await weekdaySends(500);
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.equal(rows.length, 22);
    assert.ok(rows.length < 1000);
    const series = chart(rows, runs, campaigns, new Date("2026-10-06T23:00:00Z"));
    assert.equal(total(series), 11000);
    assert.ok(series.filter((d) => d.count > 0).every((d) => d.count === 500 && days.includes(d.date)));
  });
});

describe("newsletter_daily_send_counts — what counts", () => {
  it("a duplicated email.sent for the same email_id is counted once, at its earliest time", async () => {
    const { run } = await createRun(REGULAR);
    await insertEvents([
      { runId: run.id, emailId: "e1", at: "2026-10-05T23:59:59Z", receivedAt: "2026-10-06T00:00:01Z" },
      { runId: run.id, emailId: "e1", at: "2026-10-06T00:00:05Z" },
      { runId: run.id, emailId: "e2", at: "2026-10-06T00:00:01Z" },
    ]);
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.deepEqual(
      rows.map((r) => [r.send_date, r.sent_count]).sort(),
      [
        ["2026-10-05", 1],
        ["2026-10-06", 1],
      ],
    );
  });

  it("leaves out non-PROCESSED events, other event types, unlinked events and events without email_id", async () => {
    const { run } = await createRun(REGULAR);
    const at = "2026-10-06T00:00:30Z";
    await insertEvents([
      { runId: run.id, emailId: "ok", at },
      { runId: run.id, emailId: "failed", status: "FAILED", at },
      { runId: run.id, emailId: "ignored", status: "IGNORED", at },
      { runId: run.id, emailId: "processing", status: "PROCESSING", at },
      { runId: run.id, emailId: "dlv", type: "email.delivered", at },
      { runId: run.id, emailId: "open", type: "email.opened", at },
      { runId: run.id, emailId: "click", type: "email.clicked", at },
      { runId: run.id, emailId: "bounce", type: "email.bounced", at },
      { runId: null, emailId: "unlinked", at },
      { runId: run.id, emailId: null, at },
    ]);
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.deepEqual(rows, [{ source: "broadcast", broadcast_send_id: run.id, send_date: "2026-10-06", sent_count: 1 }]);
  });

  it("legacy: subscriber deliveries per day; promotional (prospect) deliveries and unsent rows left out", async () => {
    await insertLegacy(50, "2026-10-05T00:30:00Z");
    await insertLegacy(30, "2026-10-05T00:30:00Z", { promo: true });
    await db.exec("insert into public.newsletter_deliveries (subscriber_id, sent_at) values (gen_random_uuid(), null)");
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.deepEqual(rows, [{ source: "legacy", broadcast_send_id: null, send_date: "2026-10-05", sent_count: 50 }]);
  });

  it("mixed day: legacy 50 + Broadcast 108 → chart 158", async () => {
    const { campaign, run } = await createRun(REGULAR);
    await insertLegacy(50, "2026-10-05T00:30:00Z");
    await bulkSent(run.id, 108, "2026-10-05T00:40:00Z", "mixed");
    const series = chart(await rpc("2026-09-07T00:00:00Z"), [run], [campaign], new Date("2026-10-06T00:00:00Z"));
    assert.deepEqual(nonZero(series), { "2026-10-05": 158 });
  });

  it("window: received_at and the event time must both be on/after since; legacy by sent_at", async () => {
    const { run } = await createRun(REGULAR);
    const since = "2026-09-07T00:13:14Z";
    await insertEvents([
      { runId: run.id, emailId: "in", at: "2026-09-07T00:13:14Z" },
      { runId: run.id, emailId: "old-event", at: "2026-09-07T00:13:13Z", receivedAt: "2026-09-07T00:13:20Z" },
      { runId: run.id, emailId: "old-received", at: "2026-09-07T00:13:20Z", receivedAt: "2026-09-07T00:13:13Z" },
    ]);
    await insertLegacy(1, "2026-09-07T00:13:13Z");
    await insertLegacy(2, "2026-09-07T00:13:14Z");
    const rows = await rpc(since);
    assert.deepEqual(
      rows.map((r) => [r.source, r.sent_count]).sort(),
      [
        ["broadcast", 1],
        ["legacy", 2],
      ],
    );
  });

  it("falls back to received_at when the provider time is missing", async () => {
    const { run } = await createRun(REGULAR);
    await insertEvents([{ runId: run.id, emailId: "e1", at: null, receivedAt: "2026-10-06T01:00:00Z" }]);
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.deepEqual(rows.map((r) => r.send_date), ["2026-10-06"]);
  });
});

describe("newsletter_daily_send_counts — day boundaries (UTC days, as the chart always showed)", () => {
  // The chart keys each day by the ISO timestamp's first 10 characters, i.e.
  // the UTC date. 09:00 KST issues land at 00:00 UTC, the same calendar day.
  const cases: [string, string, string][] = [
    ["23:59 KST (14:59 UTC)", "2026-10-05T14:59:00Z", "2026-10-05"],
    ["00:00 KST (15:00 UTC, KST date already the next day)", "2026-10-05T15:00:00Z", "2026-10-05"],
    ["08:59:59 KST (23:59:59 UTC)", "2026-10-05T23:59:59Z", "2026-10-05"],
    ["09:00 KST (00:00 UTC)", "2026-10-06T00:00:00Z", "2026-10-06"],
  ];
  for (const [label, at, expected] of cases) {
    it(`${label} → ${expected}, same as the old ISO-string bucketing`, async () => {
      const { run } = await createRun(REGULAR);
      await insertEvents([{ runId: run.id, emailId: "e", at }]);
      await insertLegacy(1, at);
      const rows = await rpc("2026-09-07T00:00:00Z");
      assert.deepEqual(rows.map((r) => r.send_date), [expected, expected]);
      assert.equal(new Date(at).toISOString().slice(0, 10), expected);
    });
  }

  it("does not depend on the session time zone", async () => {
    const { run } = await createRun(REGULAR);
    await insertEvents([{ runId: run.id, emailId: "e", at: "2026-10-05T15:00:00Z" }]);
    await db.exec("set timezone = 'Asia/Seoul'");
    const rows = await rpc("2026-09-07T00:00:00Z");
    assert.deepEqual(rows.map((r) => r.send_date), ["2026-10-05"]);
  });
});

// The algorithm the page used before 0033 (fetch rows, dedupe and bucket in
// JS) — kept here only to prove the new path gives identical charts.
function oldChart(input: {
  legacy: { sent_at: string | null; prospect_id: string | null }[];
  events: { broadcast_send_id: string | null; email_id: string | null; event_type: string; status: string; event_created_at: string | null; received_at: string }[];
  runs: Run[];
  campaigns: Campaign[];
  since: Date;
  now: Date;
}) {
  const sinceIso = input.since.toISOString();
  const inRange = (ts: string | null): ts is string => !!ts && new Date(ts).getTime() >= input.since.getTime();
  const included = new Set(input.campaigns.filter((c) => !(c.send_type === "SCHEDULED" && c.scheduled_at && new Date(c.scheduled_at).getTime() === new Date("2099-12-31T00:00:00Z").getTime())).map((c) => c.id));
  const campaignBySendId = new Map(input.runs.map((r) => [r.id, r.campaign_id]));
  const queried = input.events.filter(
    (e) => e.event_type === "email.sent" && e.status === "PROCESSED" && e.broadcast_send_id && new Date(e.received_at) >= new Date(sinceIso),
  );
  const broadcast = new Map<string, string>();
  for (const e of [...queried].sort((a, b) => (a.event_created_at ?? a.received_at).localeCompare(b.event_created_at ?? b.received_at))) {
    if (!e.broadcast_send_id || !e.email_id || broadcast.has(e.email_id)) continue;
    const campaignId = campaignBySendId.get(e.broadcast_send_id);
    if (!campaignId || !included.has(campaignId)) continue;
    const at = e.event_created_at ?? e.received_at;
    if (inRange(at)) broadcast.set(e.email_id, at);
  }
  const legacy = input.legacy.filter((d) => d.prospect_id === null && d.sent_at && new Date(d.sent_at) >= new Date(sinceIso)).map((d) => d.sent_at);
  const buckets = new Map(trendDayKeys(30, input.now).map((k) => [k, 0]));
  for (const raw of [...legacy.filter(inRange), ...broadcast.values()]) {
    const key = new Date(raw).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

describe("newsletter_daily_send_counts — same chart as the old row-by-row path", () => {
  it("matches on a randomized mix (regular, B2, duplicates, statuses, types, window edges, legacy, promo)", async () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];

    const regularA = await createRun(REGULAR);
    const regularB = await createRun({ send_type: "RECURRING", scheduled_at: null });
    const b2 = await createRun(B2);
    const runs = [regularA.run, regularB.run, b2.run];
    const campaigns = [regularA.campaign, regularB.campaign, b2.campaign];

    const now = new Date("2026-10-06T00:13:14Z");
    const since = new Date("2026-09-07T00:13:14Z");
    const base = new Date("2026-09-05T00:00:00Z").getTime();
    const span = 33 * 24 * 3600 * 1000;
    const ts = () => new Date(base + Math.floor(rand() * span)).toISOString();

    const events: Parameters<typeof oldChart>[0]["events"] = [];
    for (let i = 0; i < 1500; i++) {
      const at = rand() < 0.1 ? null : ts();
      const received = at && rand() < 0.8 ? new Date(new Date(at).getTime() + 2000).toISOString() : ts();
      // A Resend email id belongs to one Broadcast run, as in production.
      const email = Math.floor(rand() * 1200);
      events.push({
        broadcast_send_id: rand() < 0.05 ? null : runs[email % runs.length].id,
        email_id: rand() < 0.03 ? null : `e${email}`,
        event_type: pick(["email.sent", "email.sent", "email.sent", "email.delivered", "email.opened", "email.clicked"]),
        status: pick(["PROCESSED", "PROCESSED", "PROCESSED", "IGNORED", "FAILED"]),
        event_created_at: at,
        received_at: received,
      });
    }
    let n = 0;
    for (const e of events) {
      await db.query(
        `insert into public.newsletter_webhook_events (svix_id, event_type, status, broadcast_send_id, email_id, event_created_at, received_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [`rand-${++n}`, e.event_type, e.status, e.broadcast_send_id, e.email_id, e.event_created_at, e.received_at],
      );
    }
    const legacy: { sent_at: string | null; prospect_id: string | null }[] = [];
    for (let i = 0; i < 300; i++) legacy.push({ sent_at: rand() < 0.05 ? null : ts(), prospect_id: rand() < 0.2 ? "p" : null });
    for (const d of legacy) {
      await db.query("insert into public.newsletter_deliveries (subscriber_id, prospect_id, sent_at) values (gen_random_uuid(), $1, $2)", [
        d.prospect_id ? "00000000-0000-0000-0000-000000000001" : null,
        d.sent_at,
      ]);
    }

    const expected = oldChart({ legacy, events, runs, campaigns, since, now });
    const actual = chart(await rpc(since.toISOString()), runs, campaigns, now);
    assert.ok(total(expected) > 0);
    assert.deepEqual(actual, expected);
  });
});

describe("newsletter_daily_send_counts — security", () => {
  it("only service_role may execute it; anon / authenticated / public may not", async () => {
    const { rows } = await db.query<{ role: string; can: boolean }>(
      `select r as role, has_function_privilege(r, 'public.newsletter_daily_send_counts(timestamptz)', 'execute') as can
       from unnest(array['anon', 'authenticated', 'service_role']) r`,
    );
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.role, r.can])), { anon: false, authenticated: false, service_role: true });
  });

  it("is a read-only (stable) security-invoker function with a fixed search_path", async () => {
    const { rows } = await db.query<{ volatile: string; definer: boolean; config: string[] | null }>(
      `select provolatile as volatile, prosecdef as definer, proconfig as config
       from pg_proc where proname = 'newsletter_daily_send_counts'`,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].volatile, "s");
    assert.equal(rows[0].definer, false);
    assert.deepEqual(rows[0].config, ['search_path=""']);
  });
});

describe("admin analytics page — send trend data source", () => {
  it("reads the aggregated counts, never the individual email.sent events", () => {
    assert.ok(PAGE.includes('rpc("newsletter_daily_send_counts"'));
    assert.ok(!PAGE.includes("newsletter_webhook_events"));
  });
});
