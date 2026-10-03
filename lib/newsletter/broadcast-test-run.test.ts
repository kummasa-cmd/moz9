import { describe, it, before, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FakeSupabase } from "./test-support/fake-supabase";
import type { PreflightResult } from "./broadcast-preflight";
import type { BroadcastRunStore, ReserveInput } from "./broadcast-sender";
import { BROADCAST_TEST_MAX_CONTACTS } from "./broadcast-test-run";

// B2 (broadcast-test-run.ts): processCampaign({ broadcastTest }) against an
// in-memory DB and fake Resend clients — no network. config.ts reads env at
// import time, so it is set before the scheduler is loaded.
process.env.RESEND_API_KEY = "re_test_dummy";
process.env.NEWSLETTER_SENDER_EMAIL = "news@example.test";

type Scheduler = typeof import("./scheduler");
type TestRun = typeof import("./broadcast-test-run");
type Preflight = typeof import("./broadcast-preflight");
let scheduler: Scheduler;
let b2: TestRun;
let preflightModule: Preflight;
let isCampaignDue: typeof import("./campaign-due").isCampaignDue;

before(async () => {
  scheduler = await import("./scheduler");
  b2 = await import("./broadcast-test-run");
  preflightModule = await import("./broadcast-preflight");
  ({ isCampaignDue } = await import("./campaign-due"));
});

const PROD = "seg-prod-0000";
const TEST = "seg-test-1111";

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["RESEND_NEWSLETTER_SEGMENT_ID", "RESEND_TEST_SEGMENT_ID", "NEWSLETTER_DELIVERY_MODE"];
let originalConsole: { error: typeof console.error; warn: typeof console.warn };

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.RESEND_NEWSLETTER_SEGMENT_ID = PROD;
  process.env.RESEND_TEST_SEGMENT_ID = TEST;
  delete process.env.NEWSLETTER_DELIVERY_MODE; // production default: legacy
  originalConsole = { error: console.error, warn: console.warn };
  console.error = () => {};
  console.warn = () => {};
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
});

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function passing(subscribed: number): PreflightResult {
  return { ok: true, blocking: [], warnings: [], eligible: 92, segmentSubscribed: subscribed };
}

function memoryStore() {
  const rows: { id: string; input: ReserveInput; status: string; broadcastId: string | null }[] = [];
  const store: BroadcastRunStore = {
    async reserve(input) {
      const row = { id: `run-${rows.length + 1}`, input, status: "CREATING", broadcastId: null };
      rows.push(row);
      return { ok: true, rowId: row.id };
    },
    async reuse() {
      return false;
    },
    async markDraft(rowId, broadcastId) {
      Object.assign(rows.find((r) => r.id === rowId)!, { status: "DRAFT", broadcastId });
    },
    async markSendRequested(rowId) {
      rows.find((r) => r.id === rowId)!.status = "SEND_REQUESTED";
    },
    async markFailed(rowId) {
      rows.find((r) => r.id === rowId)!.status = "FAILED";
    },
  };
  return { store, rows };
}

function setup(campaign: Record<string, unknown> = {}, opts: { failCreate?: boolean } = {}) {
  const db = new FakeSupabase({
    newsletter_campaigns: [
      {
        id: "c-b2",
        newsletter_id: "nl-b2",
        send_type: "SCHEDULED",
        scheduled_at: "2099-12-31T00:00:00.000Z",
        recurring_time: null,
        range_start: null,
        range_end: null,
        target_all: true,
        target_tags: [],
        audience: "SUBSCRIBERS",
        status: "SCHEDULED",
        last_sent_date: null,
        sending_started_at: null,
        sent_at: null,
        last_error: null,
        total_recipients: 0,
        total_sent: 0,
        ...campaign,
      },
    ],
    newsletters: [{ id: "nl-b2", slug: "b2-broadcast-test", subject: "[B2 테스트]", blocks: [], published_at: null }],
    newsletter_deliveries: [],
  });

  const calls = {
    legacyBatch: 0,
    legacyIssue: 0,
    legacyUsage: 0,
    create: [] as { segmentId?: string; segment_id?: string }[],
    send: 0,
    preflight: [] as string[],
    testPreflight: [] as string[],
    issue: 0,
    usage: 0,
    renderIssue: [] as (number | null)[],
  };
  const { store, rows } = memoryStore();
  let testPreflight: PreflightResult = passing(1);
  let ordinaryPreflight: PreflightResult = passing(92);

  const client = {
    broadcasts: {
      create: async (payload: { segmentId?: string; segment_id?: string }) => {
        calls.create.push(payload);
        return opts.failCreate
          ? { data: null, error: { name: "validation_error", message: "nope", statusCode: 422 }, headers: {} }
          : { data: { id: "bc-1" }, error: null, headers: {} };
      },
      send: async (id: string) => {
        calls.send++;
        return { data: { id }, error: null, headers: {} };
      },
    },
  };

  const deps = {
    db: db as never,
    getResendClient: () =>
      ({
        batch: {
          send: async () => {
            calls.legacyBatch++;
            return { data: { data: [] }, error: null };
          },
        },
      }) as never,
    getTargetSubscribers: async () => [{ id: "s-1", email: "a@example.test", unsubscribeToken: "t" }] as never,
    getTargetProspects: async () => [],
    assignNewsletterIssueNumber: async () => {
      calls.legacyIssue++;
      return 11;
    },
    getAdBannersByIds: async () => ({}),
    recordBoardPostNewsletterUsage: async () => {
      calls.legacyUsage++;
    },
    broadcast: {
      createClient: () => client as never,
      runPreflight: async (_db: unknown, _c: unknown, segmentId: string) => {
        calls.preflight.push(segmentId);
        return ordinaryPreflight;
      },
      runTestPreflight: async (_db: unknown, _c: unknown, segmentId: string) => {
        calls.testPreflight.push(segmentId);
        return testPreflight;
      },
      loadTiming: async () => ({ send_type: "SCHEDULED", scheduled_at: "2099-12-31T00:00:00.000Z", recurring_time: null, created_at: "2026-10-03T00:00:00Z" }),
      getRecipientCount: async () => 92,
      assignIssueNumber: async () => {
        calls.issue++;
        return 11;
      },
      renderHtml: async (_n: unknown, issueNumber: number | null) => {
        calls.renderIssue.push(issueNumber);
        return '<p>hi</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">수신거부</a>';
      },
      createStore: () => store,
      recordUsage: async () => {
        calls.usage++;
      },
    },
  };

  return {
    db,
    deps,
    calls,
    runs: rows,
    campaignRow: () => db.rows("newsletter_campaigns")[0],
    setTestPreflight: (p: PreflightResult) => (testPreflight = p),
    setOrdinaryPreflight: (p: PreflightResult) => (ordinaryPreflight = p),
  };
}

function assertNothingSent(s: ReturnType<typeof setup>) {
  assert.equal(s.calls.legacyBatch, 0, "legacy batch.send must never run");
  assert.equal(s.calls.create.length, 0, "no Broadcast draft");
  assert.equal(s.calls.send, 0, "no Broadcast send");
  assert.equal(s.runs.length, 0, "no broadcast_sends row");
  assert.equal(s.db.rows("newsletter_deliveries").length, 0, "no legacy deliveries");
}

// ---------------------------------------------------------------------------
// processCampaign({ broadcastTest })
// ---------------------------------------------------------------------------

describe("B2: processCampaign({ broadcastTest }) — valid run", () => {
  it("claims the far-future campaign and sends a Broadcast to the test segment while the global mode is legacy", async () => {
    const s = setup();
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });

    assert.deepEqual(result, { ok: true, sent: 1, recipients: 1, failed: 0, broadcastId: "bc-1" });
    assert.deepEqual(s.calls.testPreflight, [TEST]);
    assert.deepEqual(s.calls.preflight, [], "the all-subscribers preflight is not used");
    assert.equal(s.calls.create.length, 1);
    const payload = s.calls.create[0];
    assert.equal(payload.segmentId ?? payload.segment_id, TEST);
    assert.equal(s.calls.send, 1);
    assert.equal(s.calls.legacyBatch, 0);

    assert.equal(s.runs.length, 1);
    assert.equal(s.runs[0].input.segmentId, TEST);
    assert.equal(s.runs[0].input.runKey, "once");
    assert.equal(s.runs[0].input.recipientEstimate, 1);
    assert.equal(s.runs[0].status, "SEND_REQUESTED");

    const row = s.campaignRow();
    assert.equal(row.status, "SENT");
    assert.equal(row.total_recipients, 1);
    assert.equal(row.total_sent, 1);
    assert.equal(row.scheduled_at, "2099-12-31T00:00:00.000Z", "schedule untouched");
    assert.ok(row.sending_started_at, "went through claimCampaign");
  });

  it("recipient count is the test segment's subscribed Contacts, not Supabase", async () => {
    const s = setup();
    s.setTestPreflight(passing(3));
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    assert.equal(result.ok && result.recipients, 3);
    assert.equal(s.campaignRow().total_recipients, 3);
    assert.equal(s.campaignRow().total_sent, 3);
    assert.equal(s.runs[0].input.recipientEstimate, 3);
  });

  it("assigns no issue number and records no board-post usage", async () => {
    const s = setup();
    await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    assert.equal(s.calls.issue, 0);
    assert.equal(s.calls.legacyIssue, 0);
    assert.deepEqual(s.calls.renderIssue, [null]);
    assert.equal(s.calls.usage, 0);
    assert.equal(s.calls.legacyUsage, 0);
  });

  it("5 subscribed Contacts is the upper bound and still passes", async () => {
    const s = setup();
    s.setTestPreflight(passing(BROADCAST_TEST_MAX_CONTACTS));
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    assert.equal(result.ok, true);
  });
});

describe("B2: rejected before the claim (campaign untouched, nothing sent)", () => {
  const cases: [string, () => void, Record<string, unknown>, string, RegExp][] = [
    ["the operating segment id", () => {}, {}, PROD, /검레터 구독자 Segment/],
    ["a missing RESEND_TEST_SEGMENT_ID", () => delete process.env.RESEND_TEST_SEGMENT_ID, {}, TEST, /RESEND_TEST_SEGMENT_ID가 설정되지/],
    ["a missing RESEND_NEWSLETTER_SEGMENT_ID", () => delete process.env.RESEND_NEWSLETTER_SEGMENT_ID, {}, TEST, /운영 Segment와의 구분/],
    ["a wrong segment id", () => {}, {}, "seg-other", /RESEND_TEST_SEGMENT_ID와 다릅니다/],
    ["test env equal to the operating segment", () => (process.env.RESEND_TEST_SEGMENT_ID = PROD), {}, PROD, /같습니다/],
    ["a promotional campaign", () => {}, { audience: "PROSPECTS" }, TEST, /홍보/],
    ["a tag-targeted campaign", () => {}, { target_all: false, target_tags: ["vip"] }, TEST, /태그 타깃/],
    ["a real campaign (not made by the B2 script)", () => {}, { scheduled_at: "2026-10-03T00:00:00.000Z" }, TEST, /2099 예약/],
    ["an IMMEDIATE campaign", () => {}, { send_type: "IMMEDIATE", scheduled_at: null }, TEST, /2099 예약/],
  ];

  for (const [label, arrange, campaign, segmentId, expected] of cases) {
    it(label, async () => {
      arrange();
      const s = setup(campaign);
      const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId } });

      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.error, expected);
      assertNothingSent(s);
      assert.deepEqual(s.calls.testPreflight, []);
      assert.equal(s.campaignRow().status, "SCHEDULED", "not claimed");
      assert.equal(s.campaignRow().sending_started_at, null);
    });
  }

  it("even with NEWSLETTER_DELIVERY_MODE=broadcast a rejected B2 run never reaches the ordinary Broadcast path", async () => {
    process.env.NEWSLETTER_DELIVERY_MODE = "broadcast";
    const s = setup();
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: PROD } });
    assert.equal(result.ok, false);
    assert.deepEqual(s.calls.preflight, []);
    assertNothingSent(s);
  });
});

describe("B2: rejected after the claim (campaign FAILED, no fallback)", () => {
  const blockedPreflight = (code: "RESEND_SUPPRESSED_BUT_SUBSCRIBED" | "SUPPRESSION_READ_FAILED" | "RESEND_SUBSCRIBED_UNKNOWN" | "RESEND_SUBSCRIBED_NOT_ELIGIBLE"): PreflightResult => ({
    ok: false,
    blocking: [{ code, count: code === "SUPPRESSION_READ_FAILED" ? 0 : 1, sampleIds: code === "SUPPRESSION_READ_FAILED" ? [] : ["sub-0001"] }],
    warnings: [],
    eligible: 92,
    segmentSubscribed: 1,
  });

  const cases: [string, PreflightResult, RegExp][] = [
    ["zero subscribed Contacts", passing(0), /구독 중인 Contact가 없습니다/],
    ["6 subscribed Contacts (over the limit)", passing(BROADCAST_TEST_MAX_CONTACTS + 1), /상한\(5명\)/],
    ["an account-suppressed Contact", blockedPreflight("RESEND_SUPPRESSED_BUT_SUBSCRIBED"), /Resend 계정 suppression 대상/],
    ["an unreadable suppression list", blockedPreflight("SUPPRESSION_READ_FAILED"), /suppression 목록 조회 실패/],
    ["an unknown Contact", blockedPreflight("RESEND_SUBSCRIBED_UNKNOWN"), /Supabase에 없는 Contact/],
    ["a not-eligible Contact", blockedPreflight("RESEND_SUBSCRIBED_NOT_ELIGIBLE"), /Supabase 수신 비대상/],
  ];

  for (const [label, preflight, expected] of cases) {
    it(label, async () => {
      const s = setup();
      s.setTestPreflight(preflight);
      const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });

      assert.equal(result.ok, false);
      assert.match(result.ok ? "" : result.error, expected);
      assertNothingSent(s);
      assert.equal(s.campaignRow().status, "FAILED", "a blocked B2 run is not retried");
      assert.match(String(s.campaignRow().last_error), expected);
      assert.equal(String(s.campaignRow().last_error).includes("@"), false);
    });
  }

  it("a Broadcast API failure marks the campaign FAILED and never falls back to legacy", async () => {
    const s = setup({}, { failCreate: true });
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    assert.equal(result.ok, false);
    assert.equal(s.calls.legacyBatch, 0);
    assert.equal(s.db.rows("newsletter_deliveries").length, 0);
    assert.equal(s.calls.send, 0);
    assert.equal(s.campaignRow().status, "FAILED");
    assert.equal(s.runs[0].status, "FAILED");
  });

  it("a FAILED B2 campaign can't be claimed again", async () => {
    const s = setup();
    s.setTestPreflight(passing(0));
    await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    s.setTestPreflight(passing(1));
    const again = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps, broadcastTest: { segmentId: TEST } });
    assert.equal(again.ok === false && again.skipped, true);
    assertNothingSent(s);
  });
});

// ---------------------------------------------------------------------------
// Ordinary campaigns are unchanged
// ---------------------------------------------------------------------------

describe("a B2 campaign is never sent by an ordinary run (crashed-script leftover)", () => {
  // Postgres hands timestamptz back as "+00:00", not ".000Z".
  for (const scheduledAt of ["2099-12-31T00:00:00.000Z", "2099-12-31T00:00:00+00:00"]) {
    for (const [label, trigger, mode] of [
      ["admin 지금 발송, legacy mode", "manual", undefined],
      ["send-due, legacy mode", "schedule", undefined],
      ["admin 지금 발송, broadcast mode", "manual", "broadcast"],
    ] as const) {
      it(`${label} (${scheduledAt})`, async () => {
        if (mode) process.env.NEWSLETTER_DELIVERY_MODE = mode;
        const s = setup({ scheduled_at: scheduledAt });
        const result = await scheduler.processCampaign("c-b2", { trigger, deps: s.deps });

        assert.equal(result.ok, false);
        assert.match(result.ok ? "" : result.error, /B2 스크립트로만/);
        assertNothingSent(s);
        assert.deepEqual(s.calls.preflight, []);
        assert.equal(s.campaignRow().status, "SCHEDULED", "not claimed");
      });
    }
  }
});

describe("B2 leaves ordinary campaigns unchanged", () => {
  it("without broadcastTest and the default (legacy) mode, processCampaign uses batch.send as before", async () => {
    const s = setup({ scheduled_at: "2026-10-01T00:30:00.000Z" });
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps });
    assert.equal(result.ok, true);
    assert.equal(s.calls.legacyBatch, 1);
    assert.equal(s.calls.create.length, 0);
    assert.deepEqual(s.calls.testPreflight, []);
  });

  it("an ordinary Broadcast campaign uses the operating segment and the all-subscribers preflight", async () => {
    process.env.NEWSLETTER_DELIVERY_MODE = "broadcast";
    const s = setup({ scheduled_at: "2026-10-03T00:00:00.000Z" });
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps });
    assert.equal(result.ok, true);
    assert.deepEqual(s.calls.preflight, [PROD]);
    assert.deepEqual(s.calls.testPreflight, []);
    assert.equal(s.runs[0].input.segmentId, PROD);
    assert.equal(s.calls.issue, 1, "ordinary runs still get an issue number");
    assert.equal(s.calls.usage, 1, "ordinary runs still record usage");
  });

  it("an ordinary Broadcast campaign is still blocked by the eligible gap", async () => {
    process.env.NEWSLETTER_DELIVERY_MODE = "broadcast";
    const s = setup({ scheduled_at: "2026-10-03T00:00:00.000Z" });
    s.setOrdinaryPreflight({
      ok: false,
      blocking: [{ code: "ELIGIBLE_GAP_TOO_LARGE", count: 91, sampleIds: ["s-1"] }],
      warnings: [],
      eligible: 92,
      segmentSubscribed: 1,
    });
    const result = await scheduler.processCampaign("c-b2", { trigger: "manual", deps: s.deps });
    assert.equal(result.ok, false);
    assertNothingSent(s);
  });
});

// ---------------------------------------------------------------------------
// Preflight scope
// ---------------------------------------------------------------------------

describe("preflight scope: the eligible gap is skipped only for segment_only", () => {
  const subscribers = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    id: `sub-${n}`,
    email: `user${n}@example.com`,
    status: "SUBSCRIBED",
    resend_contact_id: `c-${n}`,
    resend_synced_at: "2026-10-01T00:00:00Z",
    resend_sync_error: null,
  }));
  // The test segment holds just one of the eight eligible subscribers.
  const segmentContacts = [{ id: "c-1", email: "user1@example.com", unsubscribed: false }];

  it("all_subscribers (default) blocks on the gap", () => {
    const r = preflightModule.evaluateBroadcastPreflight({ subscribers, suppressions: [], segmentContacts, accountSuppressions: [] });
    assert.equal(r.ok, false);
    assert.deepEqual(r.blocking.map((i) => i.code), ["ELIGIBLE_GAP_TOO_LARGE"]);
  });

  it("segment_only passes, with no gap warnings", () => {
    const r = preflightModule.evaluateBroadcastPreflight(
      { subscribers, suppressions: [], segmentContacts, accountSuppressions: [] },
      { scope: "segment_only" },
    );
    assert.equal(r.ok, true);
    assert.deepEqual(r.warnings, []);
    assert.equal(r.segmentSubscribed, 1);
  });

  it("segment_only still blocks an account-suppressed, unknown or not-eligible Contact", () => {
    const blocked = (contacts: typeof segmentContacts, extra: { suppressions?: { email: string; unsubscribed_at: string }[]; accountSuppressions?: { email: string }[] } = {}) =>
      preflightModule.evaluateBroadcastPreflight(
        { subscribers, suppressions: extra.suppressions ?? [], segmentContacts: contacts, accountSuppressions: extra.accountSuppressions ?? [] },
        { scope: "segment_only" },
      );
    assert.deepEqual(blocked(segmentContacts, { accountSuppressions: [{ email: "USER1@example.com" }] }).blocking.map((i) => i.code), ["RESEND_SUPPRESSED_BUT_SUBSCRIBED"]);
    assert.deepEqual(blocked([{ id: "c-x", email: "stranger@example.com", unsubscribed: false }]).blocking.map((i) => i.code), ["RESEND_SUBSCRIBED_UNKNOWN"]);
    const notEligible = blocked(segmentContacts, { suppressions: [{ email: "user1@example.com", unsubscribed_at: "2026-09-01T00:00:00Z" }] });
    assert.ok(notEligible.blocking.some((i) => i.code === "RESEND_SUBSCRIBED_NOT_ELIGIBLE"));
  });
});

// ---------------------------------------------------------------------------
// Dry-run plan: reads only
// ---------------------------------------------------------------------------

function planFakes(opts: { contacts?: { id: string; email: string; unsubscribed: boolean }[]; suppressionFails?: boolean; sending?: number } = {}) {
  const subscribers = [
    { id: "sub-1", email: "tester@example.com", status: "SUBSCRIBED", resend_contact_id: "c-1", resend_synced_at: "2026-10-01T00:00:00Z", resend_sync_error: null },
    { id: "sub-2", email: "other@example.com", status: "SUBSCRIBED", resend_contact_id: "c-2", resend_synced_at: "2026-10-01T00:00:00Z", resend_sync_error: null },
  ];
  const db = new FakeSupabase({
    newsletter_subscribers: subscribers,
    newsletter_suppressions: [],
    newsletter_campaigns: Array.from({ length: opts.sending ?? 0 }, (_, i) => ({ id: `c-${i}`, status: "SENDING" })),
  });
  const writes: string[] = [];
  const reject = (name: string) => async () => {
    writes.push(name);
    throw new Error(`write attempted: ${name}`);
  };
  const contacts = opts.contacts ?? [{ id: "c-1", email: "tester@example.com", unsubscribed: false }];
  const client = {
    contacts: {
      list: async () => ({ data: { object: "list", data: contacts, has_more: false }, error: null, headers: {} }),
      create: reject("contacts.create"),
      update: reject("contacts.update"),
      remove: reject("contacts.remove"),
    },
    suppressions: {
      list: async () =>
        opts.suppressionFails
          ? { data: null, error: { name: "internal_server_error", message: "boom", statusCode: 500 }, headers: {} }
          : { data: { object: "list", data: [], has_more: false }, error: null, headers: {} },
      create: reject("suppressions.create"),
      remove: reject("suppressions.remove"),
    },
    broadcasts: { create: reject("broadcasts.create"), send: reject("broadcasts.send") },
  };
  return { db, planDb: db as never, client: client as never, writes };
}

describe("B2 dry-run plan", () => {
  it("reports the run and writes nothing to Supabase or Resend", async () => {
    const f = planFakes();
    const plan = await b2.planBroadcastTestRun(f.planDb, f.client, { segmentId: TEST });

    assert.equal(plan.ok, true, plan.errors.join("; "));
    assert.equal(plan.segmentId, TEST);
    assert.equal(plan.operatingSegmentId, PROD);
    assert.equal(plan.deliveryPath, "broadcast");
    assert.equal(plan.expectedRecipients, 1);
    assert.equal(plan.preflight?.ok, true);
    assert.deepEqual(plan.contacts, [{ contactId: "c-1", maskedEmail: "te***@ex***", unsubscribed: false }]);
    assert.equal(f.db.writes.length, 0, "no Supabase writes");
    assert.deepEqual(f.writes, [], "no Resend writes");
  });

  it("collects every problem: operating segment id", async () => {
    const f = planFakes();
    const plan = await b2.planBroadcastTestRun(f.planDb, f.client, { segmentId: PROD });
    assert.equal(plan.ok, false);
    assert.equal(plan.deliveryPath, null);
    assert.equal(f.db.writes.length, 0);
    assert.deepEqual(f.writes, []);
  });

  it("flags an unreadable suppression list, an empty segment and a SENDING campaign", async () => {
    const f = planFakes({ contacts: [], suppressionFails: true, sending: 1 });
    const plan = await b2.planBroadcastTestRun(f.planDb, f.client, { segmentId: TEST });
    assert.equal(plan.ok, false);
    assert.ok(plan.errors.some((e) => /suppression 목록 조회 실패/.test(e)));
    assert.ok(plan.errors.some((e) => /SENDING/.test(e)));
    assert.equal(plan.sendingCampaigns, 1);
    assert.equal(f.db.writes.length, 0);
    assert.deepEqual(f.writes, []);
  });

  it("an empty segment is an error", async () => {
    const f = planFakes({ contacts: [] });
    const plan = await b2.planBroadcastTestRun(f.planDb, f.client, { segmentId: TEST });
    assert.equal(plan.ok, false);
    assert.ok(plan.errors.some((e) => /구독 중인 Contact가 없습니다/.test(e)));
  });
});

// ---------------------------------------------------------------------------
// Rows the script creates, and where the option may be used
// ---------------------------------------------------------------------------

describe("B2 rows", () => {
  it("the campaign is never due for send-due (so never taken by the legacy cron)", () => {
    const row = b2.broadcastTestCampaignRow("nl", "stamp");
    const due = { ...row, id: "c", recurring_time: null, range_start: null, range_end: null, last_sent_date: null };
    assert.equal(isCampaignDue(due, new Date()), false);
    assert.equal(isCampaignDue(due, new Date("2099-12-30T00:00:00Z")), false);
    assert.equal(row.send_type, "SCHEDULED");
    assert.equal(row.audience, "SUBSCRIBERS");
    assert.equal(row.target_all, true);
    assert.deepEqual(row.target_tags, []);
    assert.equal(b2.checkBroadcastTestCampaign(row).ok, true);
  });

  it("the newsletter is an unpublished, unnumbered DRAFT", () => {
    const row = b2.broadcastTestNewsletterRow("stamp") as Record<string, unknown>;
    assert.equal(row.status, "DRAFT");
    assert.equal(row.published_at, null);
    assert.equal("issue_number" in row, false);
    assert.equal(row.newsletter_type, "REGULAR");
  });
});

describe("B2 option is reachable only from the B2 script", () => {
  const root = join(__dirname, "..", "..");
  const allowed = new Set([
    "lib/newsletter/scheduler.ts",
    "lib/newsletter/broadcast-sender.ts",
    "lib/newsletter/broadcast-test-run.ts",
    "scripts/newsletter/b2-campaign-broadcast.ts",
    // Imports only the pure isBroadcastTestCampaign predicate (Stage 5 stats).
    "lib/newsletter/campaign-stats.ts",
  ]);

  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
    }
    return out;
  }

  it("no app/, lib/ or scripts/ module outside the allowed set uses broadcastTest or the B2 sender", () => {
    const offenders = ["app", "lib", "scripts"]
      .flatMap((d) => walk(join(root, d)))
      .map((p) => relative(root, p).split(sep).join("/"))
      .filter((p) => !allowed.has(p))
      // Code references only (an import or the identifiers), not comments.
      .filter((p) =>
        /broadcastTest\b|sendClaimedTestCampaignViaBroadcast|from "(?:\.\/|@\/lib\/newsletter\/)broadcast-test-run"/.test(
          readFileSync(join(root, p), "utf8"),
        ),
      );
    assert.deepEqual(offenders, []);
  });
});
