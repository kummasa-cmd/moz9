import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { CreateBroadcastOptions } from "resend";
import {
  RESEND_UNSUBSCRIBE_PLACEHOLDER,
  buildBroadcastPayload,
  createBroadcastDraft,
  normalizeScheduledAt,
  redactSecrets,
  sendBroadcast,
  type BroadcastContent,
  type ResendBroadcastsClient,
} from "./resend-broadcasts";

const noSleep = { sleep: async () => {} };

const content: BroadcastContent = {
  name: "검레터 12호",
  segmentId: "seg_prod",
  from: "모즈나인 뉴스레터 <news@news.moz9.kr>",
  subject: "이번 주 검레터",
  html: `<p>본문</p><a href="${RESEND_UNSUBSCRIBE_PLACEHOLDER}">수신거부</a>`,
};

type Response = { data: { id: string } | null; error: { message: string; statusCode: number | null; name: string } | null; headers: Record<string, string> | null };

function ok(id: string): Response {
  return { data: { id }, error: null, headers: {} };
}
function err(name: string, statusCode: number | null, message = "boom"): Response {
  return { data: null, error: { name, statusCode, message }, headers: {} };
}

function fakeClient(responses: { create?: Response[]; send?: Response[] }) {
  const calls = { create: [] as unknown[], send: [] as unknown[][] };
  const createQueue = [...(responses.create ?? [])];
  const sendQueue = [...(responses.send ?? [])];
  const client = {
    broadcasts: {
      create: async (payload: unknown) => {
        calls.create.push(payload);
        return createQueue.shift() ?? ok("b_default");
      },
      send: async (...args: unknown[]) => {
        calls.send.push(args);
        return sendQueue.shift() ?? ok("b_default");
      },
    },
  } as unknown as ResendBroadcastsClient;
  return { client, calls };
}

describe("buildBroadcastPayload", () => {
  it("builds a draft payload (send: false) for the given segment", () => {
    const result = buildBroadcastPayload(content);
    assert.ok(result.ok);
    assert.deepEqual(result.payload, {
      name: "검레터 12호",
      segmentId: "seg_prod",
      from: "모즈나인 뉴스레터 <news@news.moz9.kr>",
      subject: "이번 주 검레터",
      html: content.html,
      send: false,
    });
  });

  it("passes reply-to and preview text when given", () => {
    const result = buildBroadcastPayload({ ...content, replyTo: " reply@moz9.kr ", previewText: " 미리보기 " });
    assert.ok(result.ok);
    assert.equal((result.payload as { replyTo?: string }).replyTo, "reply@moz9.kr");
    assert.equal((result.payload as { previewText?: string }).previewText, "미리보기");
  });

  it("drops empty reply-to lists", () => {
    const result = buildBroadcastPayload({ ...content, replyTo: [" ", ""] });
    assert.ok(result.ok);
    assert.equal("replyTo" in result.payload, false);
  });

  it("falls back to the subject for an empty name", () => {
    const result = buildBroadcastPayload({ ...content, name: " " });
    assert.ok(result.ok);
    assert.equal(result.payload.name, "이번 주 검레터");
  });

  it("rejects missing required fields", () => {
    assert.equal(buildBroadcastPayload({ ...content, segmentId: " " }).ok, false);
    assert.equal(buildBroadcastPayload({ ...content, from: "" }).ok, false);
    assert.equal(buildBroadcastPayload({ ...content, subject: "" }).ok, false);
    assert.equal(buildBroadcastPayload({ ...content, html: " " }).ok, false);
  });

  it("requires exactly one Resend unsubscribe placeholder", () => {
    assert.equal(buildBroadcastPayload({ ...content, html: "<p>no link</p>" }).ok, false);
    assert.equal(
      buildBroadcastPayload({ ...content, html: `${RESEND_UNSUBSCRIBE_PLACEHOLDER}${RESEND_UNSUBSCRIBE_PLACEHOLDER}` }).ok,
      false,
    );
  });

  it("rejects other template-variable syntax in the body", () => {
    const result = buildBroadcastPayload({ ...content, html: `${content.html}<p>{{name}}</p>` });
    assert.equal(result.ok, false);
  });
});

describe("normalizeScheduledAt", () => {
  const now = new Date("2026-09-30T00:00:00Z");

  it("treats an empty value as send-now", () => {
    assert.deepEqual(normalizeScheduledAt(undefined, now), { ok: true, scheduledAt: null });
    assert.deepEqual(normalizeScheduledAt("  ", now), { ok: true, scheduledAt: null });
  });

  it("converts a KST time to UTC ISO", () => {
    assert.deepEqual(normalizeScheduledAt("2026-10-01T09:00:00+09:00", now), {
      ok: true,
      scheduledAt: "2026-10-01T00:00:00.000Z",
    });
    assert.deepEqual(normalizeScheduledAt("2026-10-01T00:00Z", now), { ok: true, scheduledAt: "2026-10-01T00:00:00.000Z" });
  });

  it("rejects times without a zone and natural language", () => {
    assert.equal(normalizeScheduledAt("2026-10-01T09:00:00", now).ok, false);
    assert.equal(normalizeScheduledAt("in 1 hour", now).ok, false);
    assert.equal(normalizeScheduledAt("2026-10-01", now).ok, false);
  });

  it("rejects past and too-soon times", () => {
    assert.equal(normalizeScheduledAt("2026-09-29T23:00:00Z", now).ok, false);
    assert.equal(normalizeScheduledAt("2026-09-30T00:00:30Z", now).ok, false);
    assert.equal(normalizeScheduledAt("2026-09-30T00:01:00Z", now).ok, true);
  });

  it("rejects times more than 30 days ahead", () => {
    assert.equal(normalizeScheduledAt("2026-10-30T00:00:00Z", now).ok, true);
    assert.equal(normalizeScheduledAt("2026-10-30T00:00:01Z", now).ok, false);
  });

  it("rejects impossible dates", () => {
    assert.equal(normalizeScheduledAt("2026-13-45T09:00:00Z", now).ok, false);
  });
});

describe("createBroadcastDraft", () => {
  const payload = (buildBroadcastPayload(content) as { ok: true; payload: CreateBroadcastOptions }).payload;

  it("returns the broadcast id", async () => {
    const { client, calls } = fakeClient({ create: [ok("b_1")] });
    assert.deepEqual(await createBroadcastDraft(client, payload, noSleep), { ok: true, broadcastId: "b_1" });
    assert.equal(calls.create.length, 1);
    assert.equal((calls.create[0] as { send: boolean }).send, false);
  });

  it("refuses a payload that would send immediately", async () => {
    const { client, calls } = fakeClient({});
    const result = await createBroadcastDraft(client, { ...payload, send: true } as CreateBroadcastOptions, noSleep);
    assert.equal(result.ok, false);
    assert.equal(calls.create.length, 0);
  });

  it("retries 429 and then succeeds", async () => {
    const { client, calls } = fakeClient({ create: [err("rate_limit_exceeded", 429), ok("b_2")] });
    assert.deepEqual(await createBroadcastDraft(client, payload, noSleep), { ok: true, broadcastId: "b_2" });
    assert.equal(calls.create.length, 2);
  });

  it("does not retry quota errors", async () => {
    const { client, calls } = fakeClient({ create: [err("daily_quota_exceeded", 429)] });
    const result = await createBroadcastDraft(client, payload, noSleep);
    assert.equal(result.ok, false);
    assert.equal(calls.create.length, 1);
    if (!result.ok) assert.equal(result.retryable, false);
  });

  it("reports API validation errors without retrying", async () => {
    const { client, calls } = fakeClient({ create: [err("validation_error", 422, "segment_id invalid")] });
    const result = await createBroadcastDraft(client, payload, noSleep);
    assert.equal(calls.create.length, 1);
    assert.deepEqual(result, {
      ok: false,
      error: "validation_error (422): segment_id invalid",
      statusCode: 422,
      retryable: false,
    });
  });

  it("marks network failures retryable", async () => {
    const { client } = fakeClient({ create: [err("application_error", null, "fetch failed")] });
    const result = await createBroadcastDraft(client, payload, { ...noSleep, maxRetries: 0 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.retryable, true);
  });

  it("turns a thrown SDK error into a redacted failure", async () => {
    const client = {
      broadcasts: {
        create: async () => {
          throw new Error("boom for kim@example.com with re_abcdef123456");
        },
      },
    } as unknown as ResendBroadcastsClient;
    const result = await createBroadcastDraft(client, payload, noSleep);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.includes("kim@example.com"), false);
      assert.equal(result.error.includes("re_abcdef123456"), false);
    }
  });

  it("redacts addresses echoed back in API errors", async () => {
    const { client } = fakeClient({ create: [err("validation_error", 422, "invalid from: lee@example.com")] });
    const result = await createBroadcastDraft(client, payload, noSleep);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "validation_error (422): invalid from: <email>");
  });
});

describe("sendBroadcast", () => {
  it("sends immediately without a schedule", async () => {
    const { client, calls } = fakeClient({ send: [ok("b_1")] });
    assert.deepEqual(await sendBroadcast(client, "b_1", {}, noSleep), { ok: true, broadcastId: "b_1" });
    assert.deepEqual(calls.send[0], ["b_1", undefined]);
  });

  it("passes scheduledAt through", async () => {
    const { client, calls } = fakeClient({ send: [ok("b_1")] });
    await sendBroadcast(client, "b_1", { scheduledAt: "2026-10-01T00:00:00.000Z" }, noSleep);
    assert.deepEqual(calls.send[0], ["b_1", { scheduledAt: "2026-10-01T00:00:00.000Z" }]);
  });

  it("rejects an empty id without calling Resend", async () => {
    const { client, calls } = fakeClient({});
    assert.equal((await sendBroadcast(client, " ", {}, noSleep)).ok, false);
    assert.equal(calls.send.length, 0);
  });

  it("returns API failures", async () => {
    const { client } = fakeClient({ send: [err("not_found", 404, "Broadcast not found")] });
    const result = await sendBroadcast(client, "b_x", {}, noSleep);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.statusCode, 404);
  });
});

describe("redactSecrets", () => {
  it("masks emails, API keys, webhook secrets and bearer tokens", () => {
    const text =
      "to kim.a+1@example.co.kr key re_123456789abc secret whsec_AbCdEf123456== auth Bearer abc.def-123";
    const redacted = redactSecrets(text);
    assert.equal(redacted, "to <email> key re_*** secret whsec_*** auth Bearer ***");
  });

  it("leaves ordinary text alone", () => {
    assert.equal(redactSecrets("validation_error (422): subject missing"), "validation_error (422): subject missing");
  });
});
