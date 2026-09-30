import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeBroadcastRun, type BroadcastRunInput, type BroadcastRunStore, type ReserveInput } from "./broadcast-sender";
import { RESEND_UNSUBSCRIBE_PLACEHOLDER, type ResendBroadcastsClient } from "./resend-broadcasts";
import { buildEmailTemplate, personalizeEmail, toBroadcastHtml } from "./email";

type Row = {
  id: string;
  campaignId: string;
  runKey: string;
  status: string;
  resend_broadcast_id: string | null;
  last_error: string | null;
  scheduledAt: string | null;
};

// In-memory stand-in for newsletter_broadcast_sends with the same unique
// (campaign_id, run_key) rule.
function memoryStore(options: { failMarkDraft?: boolean; failMarkSendRequested?: boolean } = {}) {
  const rows: Row[] = [];
  const store: BroadcastRunStore = {
    async reserve(input: ReserveInput) {
      const existing = rows.find((r) => r.campaignId === input.campaignId && r.runKey === input.runKey);
      if (existing) return { ok: false, existing: { id: existing.id, status: existing.status, resend_broadcast_id: existing.resend_broadcast_id } };
      const row: Row = {
        id: `row_${rows.length + 1}`,
        campaignId: input.campaignId,
        runKey: input.runKey,
        status: "CREATING",
        resend_broadcast_id: null,
        last_error: null,
        scheduledAt: null,
      };
      rows.push(row);
      return { ok: true, rowId: row.id };
    },
    async reuse(rowId) {
      const row = rows.find((r) => r.id === rowId)!;
      if (row.status !== "FAILED" || row.resend_broadcast_id) return false;
      row.status = "CREATING";
      row.last_error = null;
      return true;
    },
    async markDraft(rowId, broadcastId) {
      if (options.failMarkDraft) throw new Error("db down");
      const row = rows.find((r) => r.id === rowId)!;
      row.status = "DRAFT";
      row.resend_broadcast_id = broadcastId;
    },
    async markSendRequested(rowId, scheduledAt) {
      if (options.failMarkSendRequested) throw new Error("db down");
      const row = rows.find((r) => r.id === rowId)!;
      row.status = "SEND_REQUESTED";
      row.scheduledAt = scheduledAt;
    },
    async markFailed(rowId, error) {
      const row = rows.find((r) => r.id === rowId)!;
      row.status = "FAILED";
      row.last_error = error;
    },
  };
  return { store, rows };
}

type ApiResponse = { data: { id: string } | null; error: { message: string; statusCode: number | null; name: string } | null; headers: Record<string, string> };

function fakeClient(opts: { create?: () => ApiResponse; send?: () => ApiResponse } = {}) {
  let n = 0;
  const calls = { create: 0, send: [] as unknown[][] };
  const client = {
    broadcasts: {
      create: async () => {
        calls.create++;
        return opts.create ? opts.create() : { data: { id: `b_${++n}` }, error: null, headers: {} };
      },
      send: async (...args: unknown[]) => {
        calls.send.push(args);
        return opts.send ? opts.send() : { data: { id: args[0] as string }, error: null, headers: {} };
      },
    },
  } as unknown as ResendBroadcastsClient;
  return { client, calls };
}

const input: BroadcastRunInput = {
  campaignId: "11111111-2222-3333-4444-555555555555",
  newsletterId: "nl_1",
  runKey: "once",
  segmentId: "seg_prod",
  recipientEstimate: 91,
  content: {
    from: "모즈나인 뉴스레터 <news@news.moz9.kr>",
    subject: "검레터",
    html: `<p>hi</p><a href="${RESEND_UNSUBSCRIBE_PLACEHOLDER}">수신거부</a>`,
  },
};

const retry = { sleep: async () => {} };

describe("executeBroadcastRun", () => {
  it("reserves, creates a draft, records it, then sends", async () => {
    const { store, rows } = memoryStore();
    const { client, calls } = fakeClient();
    const result = await executeBroadcastRun(input, { store, client, retry });

    assert.deepEqual(result, { ok: true, broadcastId: "b_1", rowId: "row_1" });
    assert.equal(calls.create, 1);
    assert.deepEqual(calls.send, [["b_1", undefined]]);
    assert.equal(rows[0].status, "SEND_REQUESTED");
    assert.equal(rows[0].resend_broadcast_id, "b_1");
  });

  it("passes a schedule time to the send call and stores it", async () => {
    const { store, rows } = memoryStore();
    const { client, calls } = fakeClient();
    await executeBroadcastRun({ ...input, scheduledAt: "2026-10-01T00:00:00.000Z" }, { store, client, retry });
    assert.deepEqual(calls.send, [["b_1", { scheduledAt: "2026-10-01T00:00:00.000Z" }]]);
    assert.equal(rows[0].scheduledAt, "2026-10-01T00:00:00.000Z");
  });

  it("refuses a second Broadcast for the same campaign run", async () => {
    const { store } = memoryStore();
    const { client, calls } = fakeClient();
    await executeBroadcastRun(input, { store, client, retry });
    const second = await executeBroadcastRun(input, { store, client, retry });

    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.duplicate, true);
    assert.equal(calls.create, 1);
    assert.equal(calls.send.length, 1);
  });

  it("allows the next day's run of a daily campaign", async () => {
    const { store } = memoryStore();
    const { client, calls } = fakeClient();
    await executeBroadcastRun({ ...input, runKey: "2026-10-01" }, { store, client, retry });
    const next = await executeBroadcastRun({ ...input, runKey: "2026-10-02" }, { store, client, retry });
    assert.equal(next.ok, true);
    assert.equal(calls.send.length, 2);
  });

  it("validates content before reserving anything", async () => {
    const { store, rows } = memoryStore();
    const { client, calls } = fakeClient();
    const result = await executeBroadcastRun(
      { ...input, content: { ...input.content, html: "<p>no unsubscribe link</p>" } },
      { store, client, retry },
    );
    assert.equal(result.ok, false);
    assert.equal(rows.length, 0);
    assert.equal(calls.create, 0);
  });

  it("draft creation failure leaves a reusable FAILED row and sends nothing", async () => {
    const { store, rows } = memoryStore();
    const failing = fakeClient({ create: () => ({ data: null, error: { name: "validation_error", statusCode: 422, message: "bad" }, headers: {} }) });
    const first = await executeBroadcastRun(input, { store, client: failing.client, retry });

    assert.equal(first.ok, false);
    assert.equal(failing.calls.send.length, 0);
    assert.equal(rows[0].status, "FAILED");
    assert.equal(rows[0].resend_broadcast_id, null);

    // Retry of the same run is allowed — nothing had been sent.
    const { client, calls } = fakeClient();
    const retried = await executeBroadcastRun(input, { store, client, retry });
    assert.equal(retried.ok, true);
    assert.equal(calls.send.length, 1);
    assert.equal(rows.length, 1);
  });

  it("send failure keeps the broadcast id and blocks any retry", async () => {
    const { store, rows } = memoryStore();
    const failing = fakeClient({ send: () => ({ data: null, error: { name: "application_error", statusCode: 500, message: "oops" }, headers: {} }) });
    const first = await executeBroadcastRun(input, { store, client: failing.client, retry });

    assert.equal(first.ok, false);
    assert.equal(rows[0].status, "FAILED");
    assert.equal(rows[0].resend_broadcast_id, "b_1");

    const { client, calls } = fakeClient();
    const second = await executeBroadcastRun(input, { store, client, retry });
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.duplicate, true);
    assert.equal(calls.create, 0);
    assert.equal(calls.send.length, 0);
  });

  it("does not send when the draft id can't be recorded", async () => {
    const { store, rows } = memoryStore({ failMarkDraft: true });
    const { client, calls } = fakeClient();
    const result = await executeBroadcastRun(input, { store, client, retry });

    assert.equal(result.ok, false);
    assert.equal(calls.send.length, 0);
    // Stays CREATING so a later run refuses instead of creating another one.
    assert.equal(rows[0].status, "CREATING");
    const again = await executeBroadcastRun(input, { store, client, retry });
    assert.equal(again.ok, false);
    assert.equal(calls.create, 1);
  });

  it("reports success when Resend accepted the send even if the status write fails", async () => {
    const { store, rows } = memoryStore({ failMarkSendRequested: true });
    const { client } = fakeClient();
    const originalError = console.error;
    console.error = () => {};
    try {
      const result = await executeBroadcastRun(input, { store, client, retry });
      assert.equal(result.ok, true);
    } finally {
      console.error = originalError;
    }
    // Still blocks a second Broadcast.
    assert.equal(rows[0].resend_broadcast_id, "b_1");
  });

  it("redacts secrets in failure messages stored on the row", async () => {
    const { store } = memoryStore();
    const failing = fakeClient({
      create: () => ({ data: null, error: { name: "validation_error", statusCode: 422, message: "bad from kim@example.com" }, headers: {} }),
    });
    const result = await executeBroadcastRun(input, { store, client: failing.client, retry });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.includes("kim@example.com"), false);
  });
});

describe("toBroadcastHtml", () => {
  const template = buildEmailTemplate('<p><a href="https://moz9.kr/post">글</a></p>', {
    newsletterId: "nl_1",
    slug: "issue-1",
    publishedAt: null,
    issueNumber: 1,
  });

  it("uses Resend's unsubscribe placeholder as the only unsubscribe link", () => {
    const html = toBroadcastHtml(template, RESEND_UNSUBSCRIBE_PLACEHOLDER);
    assert.equal(html.split(RESEND_UNSUBSCRIBE_PLACEHOLDER).length - 1, 1);
    assert.equal(html.includes("__NEWSLETTER_UNSUBSCRIBE_URL__"), false);
    assert.equal(html.includes("/newsletter/unsubscribe"), false);
  });

  it("drops our open pixel and leaves links unwrapped", () => {
    const html = toBroadcastHtml(template, RESEND_UNSUBSCRIBE_PLACEHOLDER);
    assert.equal(html.includes("__NEWSLETTER_OPEN_PIXEL__"), false);
    assert.equal(html.includes("/api/track/"), false);
    assert.ok(html.includes('href="https://moz9.kr/post"'));
  });

  it("leaves the legacy personalization unchanged", () => {
    const html = personalizeEmail(template, { trackingToken: "tok", unsubscribeToken: "unsub" });
    assert.ok(html.includes("/api/track/open/tok"));
    assert.ok(html.includes("/api/track/click/tok?url="));
    assert.ok(html.includes("/newsletter/unsubscribe?token=unsub"));
    assert.equal(html.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER), false);
  });
});
