import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./test-support/fake-supabase";
import {
  evaluateSchedulerHealth,
  handleSchedulerHealth,
  loadHealthCampaigns,
  type HealthCampaign,
} from "./scheduler-health";
import { campaignOverdue } from "./campaign-overdue";

const SECRET = "test-cron-secret-value";
const AUTH = `Bearer ${SECRET}`;
const MIN = 60 * 1000;

// 2026-10-01 09:30 KST
const SCHEDULED_AT = "2026-10-01T00:30:00.000Z";
const at = (iso: string, plusMinutes: number) => new Date(new Date(iso).getTime() + plusMinutes * MIN);

function campaign(overrides: Partial<HealthCampaign>): HealthCampaign {
  return {
    id: "b74da470-f6eb-403e-be6a-652db340976b",
    status: "SCHEDULED",
    send_type: "SCHEDULED",
    scheduled_at: SCHEDULED_AT,
    recurring_time: null,
    range_start: null,
    range_end: null,
    last_sent_date: null,
    sending_started_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function check(campaigns: HealthCampaign[], now: Date, authorization: string | null = AUTH) {
  return handleSchedulerHealth({
    authorization,
    cronSecret: SECRET,
    loadCampaigns: async () => campaigns,
    now: () => now,
  });
}

describe("scheduler health — HTTP contract", () => {
  it("nothing due → 200, ok, 0 issues", async () => {
    const now = new Date("2026-10-01T09:00:00.000Z");
    const res = await check([], now);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, checkedAt: now.toISOString(), unhealthyCount: 0, issues: [] });
  });

  it("an overdue booking → 503 with SCHEDULED_OVERDUE and a short campaign id", async () => {
    const res = await check([campaign({})], at(SCHEDULED_AT, 23));
    assert.equal(res.status, 503);
    assert.deepEqual(res.body, {
      ok: false,
      checkedAt: at(SCHEDULED_AT, 23).toISOString(),
      unhealthyCount: 1,
      issues: [{ type: "SCHEDULED_OVERDUE", campaignId: "b74da470", minutesLate: 23, since: SCHEDULED_AT }],
    });
  });

  it("missing Authorization → 401, campaigns never loaded", async () => {
    let loaded = false;
    const res = await handleSchedulerHealth({
      authorization: null,
      cronSecret: SECRET,
      loadCampaigns: async () => {
        loaded = true;
        return [];
      },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: "Unauthorized" });
    assert.equal(loaded, false);
  });

  it("wrong Bearer secret → 401", async () => {
    for (const authorization of ["Bearer wrong", SECRET, `bearer ${SECRET}`, `Bearer ${SECRET} `, "Bearer "]) {
      const res = await check([], new Date(), authorization);
      assert.equal(res.status, 401, authorization);
    }
  });

  it("CRON_SECRET not configured → 401 even for an empty Bearer", async () => {
    const res = await handleSchedulerHealth({
      authorization: "Bearer ",
      cronSecret: "",
      loadCampaigns: async () => [],
    });
    assert.equal(res.status, 401);
  });

  it("DB read failure → 500 HEALTH_CHECK_FAILED, never ok, no internals in the body", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = await handleSchedulerHealth({
        authorization: AUTH,
        cronSecret: SECRET,
        loadCampaigns: async () => {
          throw new Error('connection to "db.internal" failed: password authentication failed for user x@example.com');
        },
      });
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { ok: false, error: "HEALTH_CHECK_FAILED" });
    } finally {
      console.error = original;
    }
  });

  it("responses never carry emails, the secret, last_error or full ids", async () => {
    const leaky = {
      ...campaign({}),
      // Extra columns a careless query could return.
      last_error: "[preflight] user@example.com 차단",
      email: "user@example.com",
    } as HealthCampaign;
    const res = await check([leaky, campaign({ id: "c0ffee00-0000-0000-0000-000000000000", status: "SENDING", sending_started_at: SCHEDULED_AT })], at(SCHEDULED_AT, 30));
    const text = JSON.stringify(res.body);
    assert.equal(res.status, 503);
    assert.doesNotMatch(text, /@/);
    assert.doesNotMatch(text, new RegExp(SECRET));
    assert.doesNotMatch(text, /preflight|last_error/);
    assert.doesNotMatch(text, /b74da470-f6eb/);
    for (const issue of (res.body as { issues: { campaignId: string }[] }).issues) {
      assert.equal(issue.campaignId.length, 8);
    }
  });
});

describe("scheduler health — SCHEDULED bookings", () => {
  const cases: [string, number, number][] = [
    ["future booking", -60, 200],
    ["+14 min", 14, 200],
    ["exactly +15 min", 15, 200],
    ["+16 min", 16, 503],
  ];
  for (const [label, minutes, status] of cases) {
    it(`${label} → ${status}`, async () => {
      const res = await check([campaign({})], at(SCHEDULED_AT, minutes));
      assert.equal(res.status, status);
    });
  }
});

describe("scheduler health — SENDING stalls", () => {
  const started = "2026-10-01T00:34:07.000Z";
  const sending = campaign({ status: "SENDING", sending_started_at: started });
  const cases: [string, number, number][] = [
    ["+14 min", 14, 200],
    ["exactly +15 min", 15, 200],
    ["+16 min", 16, 503],
  ];
  for (const [label, minutes, status] of cases) {
    it(`${label} → ${status}`, async () => {
      const res = await check([sending], at(started, minutes));
      assert.equal(res.status, status);
      if (status === 503) {
        assert.equal((res.body as { issues: { type: string }[] }).issues[0].type, "SENDING_STALLED");
      }
    });
  }
});

describe("scheduler health — finished or parked campaigns are never reported", () => {
  for (const status of ["SENT", "FAILED", "CANCELLED", "PARTIAL", "DRAFT"]) {
    it(`${status} long past its booking / daily time → 200`, async () => {
      const now = new Date("2026-12-01T00:00:00.000Z");
      const res = await check(
        [
          campaign({ status }),
          campaign({ status, send_type: "RECURRING", recurring_time: "09:00:00", last_sent_date: "2026-10-01" }),
          campaign({ status, send_type: "RANGE", range_start: "2026-11-01", range_end: "2026-12-31" }),
          campaign({ status, send_type: "IMMEDIATE", scheduled_at: null, sending_started_at: SCHEDULED_AT }),
        ],
        now,
      );
      assert.equal(res.status, 200, status);
    });
  }

  it("the current Production shape (7 SENT campaigns) is healthy", async () => {
    const sent = Array.from({ length: 7 }, (_, i) =>
      campaign({ id: `0000000${i}-0000-0000-0000-000000000000`, status: "SENT", last_sent_date: "2026-09-2" + i }),
    );
    const res = await check(sent, new Date("2026-10-01T12:00:00.000Z"));
    assert.deepEqual(res.body, { ok: true, checkedAt: "2026-10-01T12:00:00.000Z", unhealthyCount: 0, issues: [] });
  });
});

describe("scheduler health — daily (RECURRING / RANGE) runs, KST", () => {
  const recurring = (overrides: Partial<HealthCampaign> = {}) =>
    campaign({ send_type: "RECURRING", scheduled_at: null, recurring_time: "09:00:00", ...overrides });

  it("sent today → healthy", async () => {
    const res = await check([recurring({ last_sent_date: "2026-10-01" })], new Date("2026-10-01T05:00:00.000Z"));
    assert.equal(res.status, 200);
  });

  it("today's 09:00 KST run missing at 09:16 → RECURRING_OVERDUE", async () => {
    const res = await check([recurring({ last_sent_date: "2026-09-30" })], new Date("2026-10-01T00:16:00.000Z"));
    assert.equal(res.status, 503);
    assert.equal((res.body as { issues: { type: string }[] }).issues[0].type, "RECURRING_OVERDUE");
  });

  it("KST 08:00 (UTC previous day) with yesterday's run sent → healthy", async () => {
    const res = await check([recurring({ last_sent_date: "2026-09-30" })], new Date("2026-09-30T23:00:00.000Z"));
    assert.equal(res.status, 200);
  });

  it("a 23:50 KST run missed is still reported after KST midnight", async () => {
    const c = recurring({ recurring_time: "23:50:00", last_sent_date: "2026-09-30" });
    assert.equal((await check([c], new Date("2026-10-01T14:58:00.000Z"))).status, 200); // 23:58 KST, in grace
    assert.equal((await check([c], new Date("2026-10-01T15:06:00.000Z"))).status, 503); // 00:06 KST next day
  });

  it("runs before the campaign was created are not owed", async () => {
    const res = await check([recurring({ created_at: "2026-10-01T01:00:00.000Z" })], new Date("2026-10-01T05:00:00.000Z"));
    assert.equal(res.status, 200);
  });

  it("date range: before the start and after the end → healthy, inside → overdue", async () => {
    const range = campaign({
      send_type: "RANGE",
      scheduled_at: null,
      range_start: "2026-10-01",
      range_end: "2026-10-03",
    });
    assert.equal((await check([range], new Date("2026-09-30T00:16:00.000Z"))).status, 200);
    assert.equal((await check([range], new Date("2026-10-04T01:00:00.000Z"))).status, 200);
    assert.equal((await check([range], new Date("2026-10-02T00:16:00.000Z"))).status, 503);
  });
});

describe("scheduler health — several problems at once", () => {
  it("counts every issue and lists the latest first", async () => {
    const now = new Date("2026-10-01T02:00:00.000Z"); // 11:00 KST
    const res = await check(
      [
        campaign({ id: "aaaaaaaa-1", scheduled_at: "2026-10-01T01:00:00.000Z" }), // 60 min
        campaign({ id: "bbbbbbbb-2", status: "SENDING", sending_started_at: "2026-10-01T01:30:00.000Z" }), // 30 min
        campaign({ id: "cccccccc-3", send_type: "RECURRING", scheduled_at: null, recurring_time: "09:00", last_sent_date: "2026-09-30" }), // 120 min
        campaign({ id: "dddddddd-4", scheduled_at: "2026-10-01T03:00:00.000Z" }), // future
        campaign({ id: "eeeeeeee-5", status: "SENT" }),
      ],
      now,
    );
    assert.equal(res.status, 503);
    const body = res.body as { unhealthyCount: number; issues: { type: string; campaignId: string; minutesLate: number }[] };
    assert.equal(body.unhealthyCount, 3);
    assert.deepEqual(
      body.issues.map((i) => [i.type, i.campaignId, i.minutesLate]),
      [
        ["RECURRING_OVERDUE", "cccccccc", 120],
        ["SCHEDULED_OVERDUE", "aaaaaaaa", 60],
        ["SENDING_STALLED", "bbbbbbbb", 30],
      ],
    );
  });
});

describe("scheduler health — same verdict as the admin list", () => {
  it("evaluateSchedulerHealth flags exactly what campaignOverdue flags", () => {
    const now = new Date("2026-10-01T02:00:00.000Z");
    const samples = [
      campaign({ scheduled_at: "2026-10-01T01:00:00.000Z" }),
      campaign({ scheduled_at: "2026-10-01T01:46:00.000Z" }),
      campaign({ status: "SENDING", sending_started_at: "2026-10-01T01:40:00.000Z" }),
      campaign({ send_type: "RECURRING", scheduled_at: null, recurring_time: "10:50", last_sent_date: "2026-09-30" }),
      campaign({ send_type: "RANGE", scheduled_at: null, range_start: "2026-10-02", range_end: "2026-10-05" }),
      campaign({ status: "SENT" }),
    ];
    for (const c of samples) {
      const fromAdmin = campaignOverdue(c, now);
      const fromHealth = evaluateSchedulerHealth([c], now).issues[0] ?? null;
      assert.equal(fromHealth === null, fromAdmin === null, JSON.stringify(c));
      if (fromAdmin && fromHealth) assert.equal(fromHealth.minutesLate, fromAdmin.minutesLate);
    }
  });
});

describe("loadHealthCampaigns", () => {
  it("reads only SCHEDULED / SENDING campaigns and pages through all of them", async () => {
    const rows = [
      ...Array.from({ length: 1500 }, (_, i) => ({ ...campaign({ id: `s-${String(i).padStart(5, "0")}` }) })),
      { ...campaign({ id: "x-sending", status: "SENDING" }) },
      { ...campaign({ id: "x-sent", status: "SENT" }) },
      { ...campaign({ id: "x-failed", status: "FAILED" }) },
    ];
    const db = new FakeSupabase({ newsletter_campaigns: rows });

    const loaded = await loadHealthCampaigns(db as never);

    assert.equal(loaded.length, 1501);
    assert.ok(loaded.every((c) => c.status === "SCHEDULED" || c.status === "SENDING"));
    assert.equal(db.writes.length, 0, "read-only");
  });

  it("throws on a DB error instead of returning an empty (healthy-looking) list", async () => {
    const failing = {
      from: () => ({
        select: () => ({
          in: () => ({
            order: () => ({
              range: async () => ({ data: null, error: { message: "permission denied" } }),
            }),
          }),
        }),
      }),
    };
    await assert.rejects(loadHealthCampaigns(failing as never), /permission denied/);
  });
});
