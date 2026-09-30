import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ELIGIBLE_GAP_BLOCK_COUNT,
  ELIGIBLE_GAP_BLOCK_RATIO,
  describePreflightIssues,
  evaluateBroadcastPreflight,
  isEligibleGapTooLarge,
  listSegmentContacts,
  runBroadcastPreflight,
  type PreflightSubscriber,
  type PreflightSuppression,
  type SegmentContact,
  type SegmentContactsClient,
} from "./broadcast-preflight";
import { campaignDueAt, preflightBlockedOutcome, PREFLIGHT_RETRY_WINDOW_MS } from "./broadcast-run";

const SYNCED = "2026-09-30T00:00:00Z";

function subscriber(n: number, overrides: Partial<PreflightSubscriber> = {}): PreflightSubscriber {
  return {
    id: `sub-${String(n).padStart(4, "0")}`,
    email: `user${n}@example.com`,
    status: "SUBSCRIBED",
    resend_contact_id: `c-${n}`,
    resend_synced_at: SYNCED,
    resend_sync_error: null,
    ...overrides,
  };
}

function contact(n: number, unsubscribed = false): SegmentContact {
  return { id: `c-${n}`, email: `user${n}@example.com`, unsubscribed };
}

// 96 subscribers, all in sync with the segment — the production state.
function healthy(size = 96) {
  const subscribers = Array.from({ length: size }, (_, i) => subscriber(i + 1));
  const segmentContacts = Array.from({ length: size }, (_, i) => contact(i + 1));
  return { subscribers, segmentContacts, suppressions: [] as PreflightSuppression[] };
}

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("evaluateBroadcastPreflight — blocking (someone who opted out could receive it)", () => {
  it("passes when Supabase and the segment match (96 / 96)", () => {
    const result = evaluateBroadcastPreflight(healthy());
    assert.deepEqual(result, { ok: true, blocking: [], warnings: [], eligible: 96, segmentSubscribed: 96 });
  });

  it("blocks an UNSUBSCRIBED subscriber whose sync failed and who is still subscribed in Resend", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { status: "UNSUBSCRIBED", resend_synced_at: null, resend_sync_error: "rate_limit_exceeded" });
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result.blocking), ["RESEND_SUBSCRIBED_NOT_ELIGIBLE", "NOT_ELIGIBLE_UNSYNCED"]);
    assert.deepEqual(result.blocking[0].sampleIds, ["sub-0001"]);
  });

  it("blocks an UNSUBSCRIBED row still subscribed in Resend even when the DB claims it's synced", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { status: "UNSUBSCRIBED" });
    assert.deepEqual(codes(evaluateBroadcastPreflight(input).blocking), ["RESEND_SUBSCRIBED_NOT_ELIGIBLE"]);
  });

  it("blocks a BOUNCED subscriber still subscribed in Resend", () => {
    const input = healthy();
    input.subscribers[1] = subscriber(2, { status: "BOUNCED" });
    assert.deepEqual(codes(evaluateBroadcastPreflight(input).blocking), ["RESEND_SUBSCRIBED_NOT_ELIGIBLE"]);
  });

  it("blocks a COMPLAINT-suppressed address still subscribed in Resend", () => {
    const input = healthy();
    input.subscribers[2] = subscriber(3, { status: "UNSUBSCRIBED", resend_synced_at: null });
    input.suppressions = [{ email: "user3@example.com", unsubscribed_at: SYNCED }];
    assert.equal(evaluateBroadcastPreflight(input).ok, false);
  });

  it("regression: SUBSCRIBED + suppressed after a past successful sync, still subscribed in Resend", () => {
    const input = healthy();
    input.suppressions = [{ email: "user4@example.com", unsubscribed_at: "2026-09-30T05:00:00Z" }];
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result.blocking), ["RESEND_SUBSCRIBED_NOT_ELIGIBLE", "NOT_ELIGIBLE_UNSYNCED"]);
  });

  it("blocks a subscribed Contact that doesn't exist in Supabase, reporting the contact id", () => {
    const input = healthy();
    input.segmentContacts.push({ id: "c-ghost", email: "ghost@example.com", unsubscribed: false });
    const result = evaluateBroadcastPreflight(input);
    assert.deepEqual(codes(result.blocking), ["RESEND_SUBSCRIBED_UNKNOWN"]);
    assert.deepEqual(result.blocking[0].sampleIds, ["c-ghost"]);
  });

  it("does not block opted-out rows once Resend has them unsubscribed and they're synced", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { status: "UNSUBSCRIBED", resend_synced_at: "2026-09-30T06:00:00Z" });
    input.segmentContacts[0] = contact(1, true);
    input.suppressions = [{ email: "user1@example.com", unsubscribed_at: "2026-09-30T05:59:59Z" }];
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, true);
    assert.equal(result.segmentSubscribed, 95);
    assert.equal(result.eligible, 95);
  });

  it("matches emails case-insensitively", () => {
    const input = healthy();
    input.segmentContacts[0] = { id: "c-1", email: "USER1@Example.com", unsubscribed: false };
    assert.equal(evaluateBroadcastPreflight(input).ok, true);
  });
});

describe("evaluateBroadcastPreflight — eligible gap (a subscriber would miss this issue)", () => {
  // Why this only warns: the recipient set is the segment, and the blocking
  // checks above already prove every subscribed contact in it is eligible.
  // An eligible row that isn't synced can only mean that person doesn't get
  // this issue — never that an opted-out person does.

  it("warns (does not block) for a missing Contact id", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { resend_contact_id: null });
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, true);
    assert.deepEqual(codes(result.warnings), ["ELIGIBLE_UNSYNCED"]);
  });

  it("warns for a sync error on an eligible subscriber who isn't in the segment yet", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { resend_sync_error: "validation_error: invalid email", resend_synced_at: null });
    input.segmentContacts.shift();
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, true);
    assert.deepEqual(codes(result.warnings), ["ELIGIBLE_UNSYNCED", "ELIGIBLE_NOT_IN_SEGMENT"]);
    assert.equal(result.segmentSubscribed, 95);
  });

  it("fixes the thresholds at 5 people or 5%", () => {
    assert.equal(ELIGIBLE_GAP_BLOCK_COUNT, 5);
    assert.equal(ELIGIBLE_GAP_BLOCK_RATIO, 0.05);
    assert.equal(isEligibleGapTooLarge(0, 96), false);
    assert.equal(isEligibleGapTooLarge(4, 96), false); // 4.2%
    assert.equal(isEligibleGapTooLarge(5, 96), true); // 5.2%
    assert.equal(isEligibleGapTooLarge(5, 1000), false); // 0.5%, not more than 5 people
    assert.equal(isEligibleGapTooLarge(6, 1000), true); // more than 5 people
    assert.equal(isEligibleGapTooLarge(1, 10), true); // 10%
    assert.equal(isEligibleGapTooLarge(1, 0), true);
  });

  it("blocks once the gap passes the threshold (5 of 96 not in the segment)", () => {
    const input = healthy();
    input.segmentContacts = input.segmentContacts.slice(5);
    const result = evaluateBroadcastPreflight(input);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result.blocking), ["ELIGIBLE_GAP_TOO_LARGE"]);
  });

  it("counts a person once even if both unsynced and missing from the segment", () => {
    const input = healthy();
    for (let i = 0; i < 4; i++) input.subscribers[i] = subscriber(i + 1, { resend_synced_at: null });
    input.segmentContacts = input.segmentContacts.slice(4);
    assert.equal(evaluateBroadcastPreflight(input).ok, true); // 4 distinct people = 4.2%
  });
});

describe("describePreflightIssues", () => {
  it("never includes an email address", () => {
    const input = healthy();
    input.subscribers[0] = subscriber(1, { status: "UNSUBSCRIBED", resend_synced_at: null });
    input.segmentContacts.push({ id: "c-ghost", email: "ghost@example.com", unsubscribed: false });
    const text = describePreflightIssues(evaluateBroadcastPreflight(input).blocking);
    assert.equal(text.includes("@"), false);
    assert.match(text, /Resend 구독인데 Supabase 수신 비대상 1건 \(sub-0001\)/);
  });
});

function pagedClient(pages: SegmentContact[][], options: { failAt?: number; stuck?: boolean } = {}) {
  const calls: unknown[] = [];
  const client = {
    contacts: {
      list: async (args: unknown) => {
        calls.push(args);
        const index = calls.length - 1;
        if (options.failAt === index) {
          return { data: null, error: { name: "application_error", message: "boom", statusCode: 500 }, headers: {} };
        }
        const page = options.stuck ? pages[0] : pages[index];
        return { data: { object: "list", data: page, has_more: options.stuck ? true : index < pages.length - 1 }, error: null, headers: {} };
      },
    },
  } as unknown as SegmentContactsClient;
  return { client, calls };
}

describe("listSegmentContacts", () => {
  it("reads every page", async () => {
    const { client, calls } = pagedClient([[contact(1), contact(2)], [contact(3)]]);
    const contacts = await listSegmentContacts(client, "seg");
    assert.equal(contacts.length, 3);
    assert.deepEqual((calls[1] as { after?: string }).after, "c-2");
  });

  it("throws on an API error mid-way — a partial list never passes", async () => {
    const { client } = pagedClient([[contact(1)], [contact(2)]], { failAt: 1 });
    await assert.rejects(listSegmentContacts(client, "seg"));
  });

  it("throws when paging doesn't advance", async () => {
    const { client } = pagedClient([[contact(1)]], { stuck: true });
    await assert.rejects(listSegmentContacts(client, "seg"));
  });
});

describe("runBroadcastPreflight", () => {
  it("blocks with SEGMENT_READ_FAILED when Resend can't be read (and never throws)", async () => {
    const { client } = pagedClient([[contact(1)]], { failAt: 0 });
    const emptyDb = {
      from: () => ({
        select: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }),
      }),
    };
    const original = console.error;
    console.error = () => {};
    try {
      const result = await runBroadcastPreflight(emptyDb as never, client, "seg");
      assert.equal(result.ok, false);
      assert.deepEqual(codes(result.blocking), ["SEGMENT_READ_FAILED"]);
    } finally {
      console.error = original;
    }
  });
});

describe("preflight retry window", () => {
  const scheduled = { send_type: "SCHEDULED", scheduled_at: "2026-10-01T00:00:00Z", recurring_time: null, created_at: "2026-09-29T00:00:00Z" };

  it("uses scheduled_at / today's KST send time / created_at as the due time", () => {
    const now = new Date("2026-10-01T01:00:00Z");
    assert.equal(campaignDueAt(scheduled, now).toISOString(), "2026-10-01T00:00:00.000Z");
    assert.equal(
      campaignDueAt({ ...scheduled, send_type: "RECURRING", recurring_time: "07:30" }, now).toISOString(),
      "2026-09-30T22:30:00.000Z",
    );
    assert.equal(
      campaignDueAt({ ...scheduled, send_type: "RANGE", recurring_time: null }, now).toISOString(),
      "2026-10-01T00:00:00.000Z", // DEFAULT_DAILY_SEND_TIME 09:00 KST
    );
    assert.equal(campaignDueAt({ ...scheduled, send_type: "IMMEDIATE" }, now).toISOString(), "2026-09-29T00:00:00.000Z");
  });

  it("goes back to SCHEDULED within 2 hours of the due time, FAILED after", () => {
    assert.equal(PREFLIGHT_RETRY_WINDOW_MS, 2 * 60 * 60 * 1000);
    assert.equal(preflightBlockedOutcome(scheduled, new Date("2026-10-01T01:59:00Z")).status, "SCHEDULED");
    assert.equal(preflightBlockedOutcome(scheduled, new Date("2026-10-01T02:00:00Z")).status, "SCHEDULED");
    assert.equal(preflightBlockedOutcome(scheduled, new Date("2026-10-01T02:00:01Z")).status, "FAILED");
    assert.equal(preflightBlockedOutcome(scheduled, new Date("2026-10-01T02:00:01Z")).retryUntil.toISOString(), "2026-10-01T02:00:00.000Z");
  });
});
