import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  campaignScheduleLockReason,
  mergeScheduleFields,
  saveCampaignSchedule,
  type CampaignSaveStore,
  type CampaignScheduleFields,
  type ExistingCampaign,
  type SendNowResult,
} from "./campaign-save";

const NEWSLETTER = "nl-1";
const ORIGINAL_SCHEDULE = "2026-10-01T00:30:00.000Z";

function fields(overrides: Partial<CampaignScheduleFields> = {}): CampaignScheduleFields {
  return {
    newsletter_id: NEWSLETTER,
    name: "검레터",
    send_type: "IMMEDIATE",
    scheduled_at: null,
    recurring_time: null,
    range_start: null,
    range_end: null,
    target_all: true,
    target_tags: [],
    ...overrides,
  };
}

// In-memory store; the campaign row is mutated like the real UPDATE would.
function fakeStore(campaign: ExistingCampaign | null, opts: { delivered?: boolean } = {}) {
  const calls = { updates: [] as { fields: CampaignScheduleFields; expectedStatus: string }[], inserts: 0 };
  const store: CampaignSaveStore = {
    async loadCampaign(id) {
      return campaign && campaign.id === id ? { ...campaign } : null;
    },
    async loadLatestCampaign(newsletterId) {
      return campaign && campaign.newsletter_id === newsletterId ? { ...campaign } : null;
    },
    async hasDelivered() {
      return opts.delivered ?? false;
    },
    async updateIfStatus(id, f, expectedStatus) {
      calls.updates.push({ fields: f, expectedStatus });
      if (!campaign || campaign.id !== id || campaign.status !== expectedStatus) return false;
      Object.assign(campaign, { status: "SCHEDULED", send_type: f.send_type, scheduled_at: f.scheduled_at });
      return true;
    },
    async insert() {
      calls.inserts++;
      return "new-campaign";
    },
  };
  return { store, calls };
}

function sendSpy() {
  const sent: string[] = [];
  const send = async (id: string): Promise<SendNowResult> => {
    sent.push(id);
    return { ok: true };
  };
  return { sent, send };
}

function campaign(status: string, send_type: string, scheduled_at: string | null = ORIGINAL_SCHEDULE): ExistingCampaign {
  return { id: "c-1", newsletter_id: NEWSLETTER, status, send_type, scheduled_at };
}

describe("saveCampaignSchedule — sent / sending campaigns are never revived", () => {
  it("SENT + IMMEDIATE re-saved: not resent, status untouched", async () => {
    const row = campaign("SENT", "IMMEDIATE", null);
    const { store, calls } = fakeStore(row, { delivered: true });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

    assert.equal(result.kind, "locked");
    assert.deepEqual(sent, []);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.inserts, 0);
    assert.equal(row.status, "SENT");
  });

  it("SENT + SCHEDULED re-saved: does not come back as SCHEDULED", async () => {
    const row = campaign("SENT", "SCHEDULED");
    const { store, calls } = fakeStore(row, { delivered: true });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(
      store,
      { existingCampaignId: "c-1", fields: fields({ send_type: "SCHEDULED", scheduled_at: "2026-10-02T00:30:00.000Z" }) },
      send,
    );

    assert.equal(result.kind, "locked");
    assert.equal(row.status, "SENT");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.equal(calls.updates.length, 0);
    assert.deepEqual(sent, []);
  });

  for (const status of ["PARTIAL", "SENDING"]) {
    it(`${status}: send settings frozen, processCampaign not called`, async () => {
      const row = campaign(status, "SCHEDULED");
      const { store, calls } = fakeStore(row);
      const { sent, send } = sendSpy();

      const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

      assert.equal(result.kind, "locked");
      assert.equal(row.status, status);
      assert.equal(row.send_type, "SCHEDULED");
      assert.equal(calls.updates.length, 0);
      assert.deepEqual(sent, []);
    });
  }

  it("locks even when the form drops the campaign id (stale form can't add a second campaign)", async () => {
    const row = campaign("SENT", "IMMEDIATE", null);
    const { store, calls } = fakeStore(row, { delivered: true });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: null, fields: fields() }, send);

    assert.equal(result.kind, "locked");
    assert.equal(calls.inserts, 0);
    assert.deepEqual(sent, []);
  });

  it("ignores a campaign id that belongs to another newsletter", async () => {
    const row = campaign("SENT", "IMMEDIATE", null);
    const { store, calls } = fakeStore(row, { delivered: true });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(
      store,
      { existingCampaignId: "c-1", fields: fields({ newsletter_id: "other-newsletter" }) },
      send,
    );

    // Treated as a new campaign of the other newsletter — the SENT one is untouched.
    assert.equal(result.kind, "saved");
    assert.equal(calls.inserts, 1);
    assert.equal(calls.updates.length, 0);
    assert.equal(row.status, "SENT");
    assert.deepEqual(sent, ["new-campaign"]);
  });

  it("reports a conflict instead of overwriting a status that changed meanwhile", async () => {
    const row = campaign("SCHEDULED", "SCHEDULED");
    const { store } = fakeStore(row);
    // A cron claim lands between the load and the update.
    const original = store.updateIfStatus;
    store.updateIfStatus = async (id, f, expected) => {
      row.status = "SENDING";
      return original(id, f, expected);
    };
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

    assert.equal(result.kind, "conflict");
    assert.equal(row.status, "SENDING");
    assert.deepEqual(sent, []);
  });
});

describe("saveCampaignSchedule — FAILED / CANCELLED keep their re-schedule policy", () => {
  it("FAILED with nobody reached can be retried", async () => {
    const row = campaign("FAILED", "IMMEDIATE", null);
    const { store } = fakeStore(row, { delivered: false });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

    assert.equal(result.kind, "saved");
    assert.equal(row.status, "SCHEDULED");
    assert.deepEqual(sent, ["c-1"]);
  });

  it("CANCELLED one-shot that was never sent can be re-booked", async () => {
    const row = campaign("CANCELLED", "SCHEDULED");
    const { store } = fakeStore(row, { delivered: false });
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(
      store,
      { existingCampaignId: "c-1", fields: fields({ send_type: "SCHEDULED", scheduled_at: "2026-10-03T00:00:00.000Z" }) },
      send,
    );

    assert.equal(result.kind, "saved");
    assert.equal(row.status, "SCHEDULED");
    assert.equal(row.scheduled_at, "2026-10-03T00:00:00.000Z");
    assert.deepEqual(sent, []);
  });

  it("FAILED / CANCELLED one-shot that already reached someone stays locked", async () => {
    for (const status of ["FAILED", "CANCELLED"]) {
      const row = campaign(status, "IMMEDIATE", null);
      const { store, calls } = fakeStore(row, { delivered: true });
      const { sent, send } = sendSpy();

      const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

      assert.equal(result.kind, "locked", status);
      assert.equal(row.status, status);
      assert.equal(calls.updates.length, 0);
      assert.deepEqual(sent, []);
    }
  });

  it("a paused (CANCELLED) RECURRING campaign can be resumed", async () => {
    const row = campaign("CANCELLED", "RECURRING", null);
    const { store } = fakeStore(row, { delivered: true });
    const { send } = sendSpy();

    const result = await saveCampaignSchedule(
      store,
      { existingCampaignId: "c-1", fields: fields({ send_type: "RECURRING", recurring_time: "09:00" }) },
      send,
    );

    assert.equal(result.kind, "saved");
    assert.equal(row.status, "SCHEDULED");
  });
});

describe("saveCampaignSchedule — legacy new / immediate saves still work", () => {
  it("new SCHEDULED campaign is inserted and not sent", async () => {
    const { store, calls } = fakeStore(null);
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(
      store,
      { existingCampaignId: null, fields: fields({ send_type: "SCHEDULED", scheduled_at: ORIGINAL_SCHEDULE }) },
      send,
    );

    assert.deepEqual(result, { kind: "saved", campaignId: "new-campaign", sendResult: null });
    assert.equal(calls.inserts, 1);
    assert.deepEqual(sent, []);
  });

  it("new IMMEDIATE campaign is inserted and sent once", async () => {
    const { store } = fakeStore(null);
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: null, fields: fields() }, send);

    assert.deepEqual(result, { kind: "saved", campaignId: "new-campaign", sendResult: { ok: true } });
    assert.deepEqual(sent, ["new-campaign"]);
  });

  it("a send failure is handed back to the caller", async () => {
    const { store } = fakeStore(null);
    const result = await saveCampaignSchedule(store, { existingCampaignId: null, fields: fields() }, async () => ({
      ok: false,
      error: "boom",
    }));
    assert.deepEqual(result, { kind: "saved", campaignId: "new-campaign", sendResult: { ok: false, error: "boom" } });
  });

  it("SCHEDULED campaign switched to IMMEDIATE keeps its original scheduled_at and sends once", async () => {
    const row = campaign("SCHEDULED", "SCHEDULED");
    const { store, calls } = fakeStore(row);
    const { sent, send } = sendSpy();

    const result = await saveCampaignSchedule(store, { existingCampaignId: "c-1", fields: fields() }, send);

    assert.equal(result.kind, "saved");
    assert.equal(calls.updates[0].fields.scheduled_at, ORIGINAL_SCHEDULE);
    assert.equal(calls.updates[0].expectedStatus, "SCHEDULED");
    assert.equal(row.send_type, "IMMEDIATE");
    assert.equal(row.scheduled_at, ORIGINAL_SCHEDULE);
    assert.deepEqual(sent, ["c-1"]);
  });

  it("an explicit new date still reschedules", async () => {
    const row = campaign("SCHEDULED", "SCHEDULED");
    const { store } = fakeStore(row);
    const { send } = sendSpy();

    await saveCampaignSchedule(
      store,
      { existingCampaignId: "c-1", fields: fields({ send_type: "SCHEDULED", scheduled_at: "2026-10-05T01:00:00.000Z" }) },
      send,
    );

    assert.equal(row.scheduled_at, "2026-10-05T01:00:00.000Z");
  });
});

describe("campaignScheduleLockReason / mergeScheduleFields", () => {
  it("locks SENT / PARTIAL / SENDING regardless of deliveries", () => {
    for (const status of ["SENT", "PARTIAL", "SENDING"]) {
      assert.ok(campaignScheduleLockReason({ status, send_type: "RECURRING", hasDelivered: false }), status);
    }
  });

  it("leaves SCHEDULED / DRAFT editable", () => {
    for (const status of ["SCHEDULED", "DRAFT"]) {
      assert.equal(campaignScheduleLockReason({ status, send_type: "IMMEDIATE", hasDelivered: true }), null, status);
    }
  });

  it("never turns an existing scheduled_at into null", () => {
    assert.equal(mergeScheduleFields(fields(), { scheduled_at: ORIGINAL_SCHEDULE }).scheduled_at, ORIGINAL_SCHEDULE);
    assert.equal(mergeScheduleFields(fields(), null).scheduled_at, null);
  });
});
