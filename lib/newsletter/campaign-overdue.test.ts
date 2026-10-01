import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { campaignOverdue, kstLabel, type OverdueCampaignInput } from "./campaign-overdue";

const MIN = 60 * 1000;

function input(overrides: Partial<OverdueCampaignInput>): OverdueCampaignInput {
  return {
    status: "SCHEDULED",
    send_type: "SCHEDULED",
    scheduled_at: null,
    recurring_time: null,
    range_start: null,
    range_end: null,
    last_sent_date: null,
    sending_started_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

// 2026-10-01 09:30 KST
const SCHEDULED_AT = "2026-10-01T00:30:00.000Z";
const at = (iso: string, plusMinutes: number) => new Date(new Date(iso).getTime() + plusMinutes * MIN);

describe("campaignOverdue — SCHEDULED campaigns", () => {
  const c = input({ scheduled_at: SCHEDULED_AT });

  it("future booking is not overdue", () => {
    assert.equal(campaignOverdue(c, at(SCHEDULED_AT, -60)), null);
  });

  it("+14 min is not overdue", () => {
    assert.equal(campaignOverdue(c, at(SCHEDULED_AT, 14)), null);
  });

  it("exactly +15 min is not overdue yet", () => {
    assert.equal(campaignOverdue(c, at(SCHEDULED_AT, 15)), null);
  });

  it("+16 min is overdue", () => {
    assert.deepEqual(campaignOverdue(c, at(SCHEDULED_AT, 16)), {
      kind: "scheduled_late",
      since: SCHEDULED_AT,
      minutesLate: 16,
    });
  });

  it("only while still SCHEDULED", () => {
    for (const status of ["SENT", "PARTIAL", "FAILED", "CANCELLED"]) {
      assert.equal(campaignOverdue({ ...c, status }, at(SCHEDULED_AT, 60)), null, status);
    }
  });

  it("an IMMEDIATE campaign that kept its original scheduled_at is not flagged as a late booking", () => {
    assert.equal(campaignOverdue({ ...c, send_type: "IMMEDIATE" }, at(SCHEDULED_AT, 60)), null);
  });
});

describe("campaignOverdue — SENDING stalls", () => {
  const started = "2026-10-01T00:34:07.000Z";

  it("+14 min sending is fine", () => {
    assert.equal(campaignOverdue(input({ status: "SENDING", sending_started_at: started }), at(started, 14)), null);
  });

  it("+16 min sending is stalled", () => {
    const result = campaignOverdue(input({ status: "SENDING", sending_started_at: started }), at(started, 16));
    assert.equal(result?.kind, "sending_stalled");
    assert.equal(result?.minutesLate, 16);
  });

  it("no claim timestamp, no verdict", () => {
    assert.equal(campaignOverdue(input({ status: "SENDING" }), at(started, 600)), null);
  });
});

describe("campaignOverdue — daily runs (KST)", () => {
  const recurring = (overrides: Partial<OverdueCampaignInput> = {}) =>
    input({ send_type: "RECURRING", recurring_time: "09:00:00", ...overrides });

  it("today's run +16 min without a send is late", () => {
    // 2026-10-01 09:16 KST
    const result = campaignOverdue(recurring({ last_sent_date: "2026-09-30" }), new Date("2026-10-01T00:16:00.000Z"));
    assert.equal(result?.kind, "daily_late");
    assert.equal(result?.since, "2026-10-01T00:00:00.000Z");
  });

  it("today's run +14 min is not late yet (and yesterday's was sent)", () => {
    assert.equal(
      campaignOverdue(recurring({ last_sent_date: "2026-09-30" }), new Date("2026-10-01T00:14:00.000Z")),
      null,
    );
  });

  it("sent today → not late", () => {
    assert.equal(
      campaignOverdue(recurring({ last_sent_date: "2026-10-01" }), new Date("2026-10-01T05:00:00.000Z")),
      null,
    );
  });

  it("uses the KST date, not the UTC date (KST 08:00 = UTC previous day 23:00)", () => {
    // 2026-10-01 08:00 KST = 2026-09-30T23:00Z. Today's 09:00 KST run isn't
    // due yet, and yesterday's (KST 2026-09-30) was sent.
    assert.equal(
      campaignOverdue(recurring({ last_sent_date: "2026-09-30" }), new Date("2026-09-30T23:00:00.000Z")),
      null,
    );
  });

  it("a late-evening run whose grace crosses KST midnight is judged on its own date", () => {
    const c = recurring({ recurring_time: "23:50:00", last_sent_date: "2026-09-30" });
    // 2026-10-01 23:58 KST: today's 23:50 run still inside the grace.
    assert.equal(campaignOverdue(c, new Date("2026-10-01T14:58:00.000Z")), null);
    // 2026-10-02 00:06 KST: the 2026-10-01 23:50 run is 16 min late, even
    // though the KST date already rolled over.
    const result = campaignOverdue(c, new Date("2026-10-01T15:06:00.000Z"));
    assert.equal(result?.kind, "daily_late");
    assert.equal(kstLabel(result!.since), "2026-10-01 23:50");
    assert.equal(result?.minutesLate, 16);
  });

  it("the midnight-crossing run is not late once it was sent that KST day", () => {
    const c = recurring({ recurring_time: "23:50:00", last_sent_date: "2026-10-01" });
    assert.equal(campaignOverdue(c, new Date("2026-10-01T15:06:00.000Z")), null);
  });

  it("an early-morning run right after KST midnight", () => {
    const c = recurring({ recurring_time: "00:05:00", last_sent_date: "2026-09-30" });
    // 2026-10-01 00:19 KST (UTC still 2026-09-30): 14 min → fine.
    assert.equal(campaignOverdue(c, new Date("2026-09-30T15:19:00.000Z")), null);
    // 2026-10-01 00:21 KST: 16 min → late.
    assert.equal(campaignOverdue(c, new Date("2026-09-30T15:21:00.000Z"))?.kind, "daily_late");
  });

  it("runs before the campaign was created are not owed", () => {
    // Created 2026-10-01 10:00 KST, after today's 09:00 run.
    const c = recurring({ created_at: "2026-10-01T01:00:00.000Z" });
    assert.equal(campaignOverdue(c, new Date("2026-10-01T05:00:00.000Z")), null);
  });

  it("accepts HH:mm recurring times", () => {
    const c = recurring({ recurring_time: "09:00", last_sent_date: "2026-09-30" });
    assert.equal(campaignOverdue(c, new Date("2026-10-01T00:16:00.000Z"))?.kind, "daily_late");
  });

  it("RANGE campaigns use the default 09:00 time and only inside the range", () => {
    const range = input({ send_type: "RANGE", range_start: "2026-10-01", range_end: "2026-10-03" });
    assert.equal(campaignOverdue(range, new Date("2026-10-01T00:16:00.000Z"))?.kind, "daily_late");
    // 2026-09-30 is before the range.
    assert.equal(campaignOverdue(range, new Date("2026-09-30T00:16:00.000Z")), null);
    // 2026-10-04 10:00 KST: past the range end.
    assert.equal(campaignOverdue(range, new Date("2026-10-04T01:00:00.000Z")), null);
  });
});
