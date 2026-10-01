import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "./test-support/fake-supabase";
import {
  cancelScheduledCampaign,
  createCampaignSaveStore,
  saveCampaignSchedule,
  type CampaignScheduleFields,
} from "./campaign-save";

// The promotional editor (promo/actions.ts::savePromoNewsletter) wired the
// same way as in production — Supabase-backed store + processCampaign — but
// against an in-memory DB and a fake Resend client. No network.
process.env.RESEND_API_KEY = "re_test_dummy";
process.env.NEWSLETTER_SENDER_EMAIL = "news@example.test";
delete process.env.NEWSLETTER_DELIVERY_MODE;

type Scheduler = typeof import("./scheduler");
let scheduler: Scheduler;

before(async () => {
  scheduler = await import("./scheduler");
});

const NEWSLETTER = "promo-nl";
const ORIGINAL_SCHEDULE = "2026-09-28T07:40:00.000Z";
const PROSPECTS = [
  { id: "p-1", email: "x@example.test", unsubscribeToken: "u-1" },
  { id: "p-2", email: "y@example.test", unsubscribeToken: "u-2" },
  { id: "p-3", email: "z@example.test", unsubscribeToken: "u-3" },
];

function promoFields(overrides: Partial<CampaignScheduleFields> = {}): CampaignScheduleFields {
  return {
    newsletter_id: NEWSLETTER,
    name: "[뉴스레터 광고]",
    send_type: "IMMEDIATE",
    scheduled_at: null,
    recurring_time: null,
    range_start: null,
    range_end: null,
    target_all: true,
    target_tags: [],
    audience: "PROSPECTS",
    ...overrides,
  };
}

function setup(opts: { campaign?: Record<string, unknown> | null; deliveries?: Record<string, unknown>[] } = {}) {
  const campaigns =
    opts.campaign === null
      ? []
      : [
          {
            id: "pc-1",
            newsletter_id: NEWSLETTER,
            name: "[뉴스레터 광고]",
            send_type: "IMMEDIATE",
            scheduled_at: null,
            recurring_time: null,
            range_start: null,
            range_end: null,
            target_all: true,
            target_tags: [],
            audience: "PROSPECTS",
            status: "SENT",
            last_sent_date: "2026-09-28",
            sending_started_at: null,
            sent_at: "2026-09-28T07:41:00.000Z",
            created_at: "2026-09-28T07:32:43.000Z",
            last_error: null,
            ...opts.campaign,
          },
        ];
  const db = new FakeSupabase({
    newsletter_campaigns: campaigns,
    newsletters: [{ id: NEWSLETTER, slug: "promo", subject: "홍보", blocks: [], published_at: null }],
    newsletter_deliveries: opts.deliveries ?? [],
  });

  const batches: { to: string }[][] = [];
  let processCalls = 0;
  const deps = {
    db: db as never,
    getResendClient: () =>
      ({
        batch: {
          send: async (payload: { to: string }[]) => {
            batches.push(payload);
            return { data: { data: [] }, error: null };
          },
        },
      }) as never,
    getTargetSubscribers: async () => {
      throw new Error("promo must not load subscribers");
    },
    getTargetProspects: async () => PROSPECTS as never,
    assignNewsletterIssueNumber: async () => {
      throw new Error("promo must not get an issue number");
    },
    getAdBannersByIds: async () => ({}),
    recordBoardPostNewsletterUsage: async () => {
      throw new Error("promo must not record board-post usage");
    },
  };

  // Exactly what savePromoNewsletter does after saving the newsletter row.
  const save = (input: { existingCampaignId: string | null; fields?: CampaignScheduleFields }) =>
    saveCampaignSchedule(
      createCampaignSaveStore(db as never),
      { existingCampaignId: input.existingCampaignId, fields: input.fields ?? promoFields() },
      (campaignId) => {
        processCalls++;
        return scheduler.processCampaign(campaignId, { deps });
      },
    );

  return {
    db,
    save,
    batches,
    processCalls: () => processCalls,
    campaigns: () => db.rows("newsletter_campaigns"),
    campaignRow: () => db.rows("newsletter_campaigns")[0],
  };
}

const sentDelivery = (id: string) => ({ id, campaign_id: "pc-1", prospect_id: id.replace("d", "p"), status: "SENT" });
const failedDelivery = (id: string) => ({ id, campaign_id: "pc-1", prospect_id: id.replace("d", "p"), status: "FAILED" });

describe("promo save — sent / sending campaigns are never resent", () => {
  for (const status of ["SENT", "PARTIAL", "SENDING"]) {
    it(`${status} promo re-saved: 0 resends, processCampaign 0 calls, status kept`, async () => {
      const t = setup({ campaign: { status }, deliveries: [sentDelivery("d-1")] });

      const result = await t.save({ existingCampaignId: "pc-1" });

      assert.equal(result.kind, "locked");
      assert.equal(t.processCalls(), 0);
      assert.equal(t.batches.length, 0);
      assert.equal(t.campaignRow().status, status);
      assert.equal(t.campaigns().length, 1, "no second campaign created");
    });
  }

  it("SENT SCHEDULED promo does not come back as SCHEDULED and keeps its settings", async () => {
    const t = setup({
      campaign: { status: "SENT", send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE },
      deliveries: [sentDelivery("d-1")],
    });

    const result = await t.save({
      existingCampaignId: "pc-1",
      fields: promoFields({ send_type: "RECURRING", recurring_time: "10:00" }),
    });

    assert.equal(result.kind, "locked");
    const row = t.campaignRow();
    assert.equal(row.status, "SENT");
    assert.equal(row.send_type, "SCHEDULED");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.equal(row.recurring_time, null);
    assert.equal(t.db.writes.filter((w) => w.table === "newsletter_campaigns").length, 0);
    assert.equal(t.batches.length, 0);
  });

  it("a stale form without campaign id can't add a second campaign to a sent promo", async () => {
    const t = setup({ campaign: { status: "SENT" }, deliveries: [sentDelivery("d-1")] });

    const result = await t.save({ existingCampaignId: null });

    assert.equal(result.kind, "locked");
    assert.equal(t.campaigns().length, 1);
    assert.equal(t.batches.length, 0);
  });
});

describe("promo save — FAILED / CANCELLED", () => {
  it("FAILED one-off that already reached a prospect cannot be resent to everyone", async () => {
    const t = setup({
      campaign: { status: "FAILED" },
      deliveries: [sentDelivery("d-1"), failedDelivery("d-2"), failedDelivery("d-3")],
    });

    const result = await t.save({ existingCampaignId: "pc-1" });

    assert.equal(result.kind, "locked");
    assert.equal(t.campaignRow().status, "FAILED");
    assert.equal(t.processCalls(), 0);
    assert.equal(t.batches.length, 0);
  });

  it("FAILED with 0 actual sends (e.g. the 9/28 daily-quota failure) can still be retried", async () => {
    const t = setup({
      campaign: { status: "FAILED", total_sent: 0 },
      deliveries: [failedDelivery("d-1"), failedDelivery("d-2"), failedDelivery("d-3")],
    });

    const result = await t.save({ existingCampaignId: "pc-1" });

    assert.equal(result.kind, "saved");
    assert.equal(t.processCalls(), 1);
    assert.equal(t.batches.length, 1);
    assert.equal(t.batches[0].length, 3);
    assert.equal(t.campaignRow().status, "SENT");
  });

  it("CANCELLED promo that was never sent can be re-booked", async () => {
    const t = setup({ campaign: { status: "CANCELLED", send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE } });

    const result = await t.save({
      existingCampaignId: "pc-1",
      fields: promoFields({ send_type: "SCHEDULED", scheduled_at: "2026-10-10T00:00:00.000Z" }),
    });

    assert.equal(result.kind, "saved");
    assert.equal(t.campaignRow().status, "SCHEDULED");
    assert.equal(t.campaignRow().scheduled_at, "2026-10-10T00:00:00.000Z");
    assert.equal(t.batches.length, 0);
  });

  it("CANCELLED one-off promo that already reached someone stays locked", async () => {
    const t = setup({ campaign: { status: "CANCELLED" }, deliveries: [sentDelivery("d-1")] });

    const result = await t.save({ existingCampaignId: "pc-1" });

    assert.equal(result.kind, "locked");
    assert.equal(t.campaignRow().status, "CANCELLED");
    assert.equal(t.batches.length, 0);
  });

  it("a QUEUED delivery left by an interrupted run counts as possibly sent", async () => {
    const t = setup({
      campaign: { status: "FAILED" },
      deliveries: [{ id: "d-1", campaign_id: "pc-1", prospect_id: "p-1", status: "QUEUED" }],
    });

    const result = await t.save({ existingCampaignId: "pc-1" });

    assert.equal(result.kind, "locked");
    assert.equal(t.batches.length, 0);
  });
});

describe("promo save — scheduled_at preservation and normal sends", () => {
  it("SCHEDULED promo switched to IMMEDIATE keeps the original scheduled_at and sends once", async () => {
    const t = setup({ campaign: { status: "SCHEDULED", send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE } });

    const result = await t.save({ existingCampaignId: "pc-1" });

    assert.equal(result.kind, "saved");
    const row = t.campaignRow();
    assert.equal(row.send_type, "IMMEDIATE");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.ok(row.sending_started_at);
    assert.ok(row.sent_at);
    assert.equal(row.audience, "PROSPECTS");
    assert.equal(t.batches.length, 1);
  });

  it("new scheduled promo is created as SCHEDULED for PROSPECTS and not sent", async () => {
    const t = setup({ campaign: null });

    const result = await t.save({
      existingCampaignId: null,
      fields: promoFields({ send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE }),
    });

    assert.equal(result.kind, "saved");
    assert.equal(t.campaigns().length, 1);
    const row = t.campaignRow();
    assert.equal(row.status, "SCHEDULED");
    assert.equal(row.audience, "PROSPECTS");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.equal(t.processCalls(), 0);
    assert.equal(t.batches.length, 0);
  });

  it("new immediate promo is created and sent once to every prospect", async () => {
    const t = setup({ campaign: null });

    const result = await t.save({ existingCampaignId: null });

    assert.equal(result.kind, "saved");
    assert.equal(result.kind === "saved" && result.sendResult?.ok, true);
    assert.equal(t.processCalls(), 1);
    assert.equal(t.batches.length, 1);
    assert.deepEqual(
      t.batches[0].map((p) => p.to),
      PROSPECTS.map((p) => p.email),
    );
    assert.equal(t.campaignRow().status, "SENT");
    assert.equal(t.db.rows("newsletter_deliveries").every((d) => d.subscriber_id === null), true);
  });
});

describe("cancelScheduledCampaign — the list's cancel action", () => {
  for (const status of ["SENT", "PARTIAL", "SENDING", "FAILED", "CANCELLED"]) {
    it(`leaves a ${status} campaign untouched`, async () => {
      const t = setup({ campaign: { status } });

      const cancelled = await cancelScheduledCampaign(t.db as never, "pc-1");

      assert.equal(cancelled, false);
      assert.equal(t.campaignRow().status, status);
    });
  }

  it("cancels a SCHEDULED campaign", async () => {
    const t = setup({ campaign: { status: "SCHEDULED", send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE } });

    assert.equal(await cancelScheduledCampaign(t.db as never, "pc-1"), true);
    assert.equal(t.campaignRow().status, "CANCELLED");
    assert.equal(t.campaignRow().scheduled_at, ORIGINAL_SCHEDULE);
  });
});
