import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./test-support/fake-supabase";

// processCampaign() against an in-memory DB and a fake Resend client — no
// network. config.ts reads env at import time, so it is set before the
// scheduler is loaded; the Resend key is a dummy and the client is never
// built (getResendClient is injected).
process.env.RESEND_API_KEY = "re_test_dummy";
process.env.NEWSLETTER_SENDER_EMAIL = "news@example.test";
delete process.env.NEWSLETTER_DELIVERY_MODE;

type Scheduler = typeof import("./scheduler");
let scheduler: Scheduler;

before(async () => {
  scheduler = await import("./scheduler");
});

const ORIGINAL_SCHEDULE = "2026-10-01T00:30:00.000Z";
const SUBSCRIBERS = [
  { id: "s-1", email: "a@example.test", unsubscribeToken: "t-1" },
  { id: "s-2", email: "b@example.test", unsubscribeToken: "t-2" },
];

function setup(campaign: Record<string, unknown>) {
  const db = new FakeSupabase({
    newsletter_campaigns: [
      {
        id: "c-1",
        newsletter_id: "nl-1",
        send_type: "SCHEDULED",
        scheduled_at: ORIGINAL_SCHEDULE,
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
        ...campaign,
      },
    ],
    newsletters: [{ id: "nl-1", slug: "issue-10", subject: "제10호", blocks: [], published_at: null }],
    newsletter_deliveries: [],
  });
  const batches: { to: string }[][] = [];
  const deps = {
    db: db as never,
    getResendClient: () =>
      ({
        batch: {
          send: async (payload: { to: string }[]) => {
            batches.push(payload);
            return { data: { data: payload.map((_, i) => ({ id: `email-${i}` })) }, error: null };
          },
        },
      }) as never,
    getTargetSubscribers: async () => SUBSCRIBERS as never,
    getTargetProspects: async () => [],
    assignNewsletterIssueNumber: async () => 10,
    getAdBannersByIds: async () => ({}),
    recordBoardPostNewsletterUsage: async () => {},
  };
  const campaignRow = () => db.rows("newsletter_campaigns")[0];
  return { db, deps, batches, campaignRow };
}

describe("processCampaign (manual = admin 지금 발송) on a SCHEDULED campaign", () => {
  it("claims, sends once and keeps send_type / scheduled_at", async () => {
    const { db, deps, batches, campaignRow } = setup({});

    const result = await scheduler.processCampaign("c-1", { trigger: "manual", deps });

    assert.deepEqual(result, { ok: true, sent: 2, recipients: 2, failed: 0 });
    assert.equal(batches.length, 1);
    assert.deepEqual(
      batches[0].map((p) => p.to),
      ["a@example.test", "b@example.test"],
    );

    const row = campaignRow();
    assert.equal(row.status, "SENT");
    assert.equal(row.send_type, "SCHEDULED");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.ok(row.sending_started_at, "claim time recorded");
    assert.ok(row.sent_at, "completion time recorded");

    // No write to the campaign ever carries a scheduling field.
    for (const w of db.writes.filter((w) => w.table === "newsletter_campaigns")) {
      for (const field of ["send_type", "scheduled_at", "recurring_time", "range_start", "range_end"]) {
        assert.equal(field in w.values, false, `${field} written: ${JSON.stringify(w.values)}`);
      }
    }
    assert.equal(db.rows("newsletter_deliveries").length, 2);
  });

  it("a second trigger on the now-SENT campaign is skipped without sending", async () => {
    const { deps, batches, campaignRow } = setup({});

    await scheduler.processCampaign("c-1", { trigger: "manual", deps });
    const again = await scheduler.processCampaign("c-1", { trigger: "schedule", deps });

    assert.equal(again.ok, false);
    assert.equal(again.ok === false && again.skipped, true);
    assert.equal(batches.length, 1);
    assert.equal(campaignRow().status, "SENT");
  });

  for (const status of ["SENT", "PARTIAL", "SENDING", "CANCELLED"]) {
    it(`does not send a ${status} campaign`, async () => {
      const { deps, batches, campaignRow } = setup({ status });

      const result = await scheduler.processCampaign("c-1", { trigger: "manual", deps });

      assert.equal(result.ok, false);
      assert.equal(batches.length, 0);
      assert.equal(campaignRow().status, status);
    });
  }

  it("RECURRING already sent today is skipped by the schedule trigger but not by manual", async () => {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const { deps, batches } = setup({ send_type: "RECURRING", recurring_time: "00:00:00", last_sent_date: today });

    const scheduled = await scheduler.processCampaign("c-1", { trigger: "schedule", deps });
    assert.equal(scheduled.ok, false);
    assert.equal(batches.length, 0);

    const manual = await scheduler.processCampaign("c-1", { trigger: "manual", deps });
    assert.equal(manual.ok, true);
    assert.equal(batches.length, 1);
  });
});
