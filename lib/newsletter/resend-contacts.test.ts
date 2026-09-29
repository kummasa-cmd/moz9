import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Resend } from "resend";
import {
  createSdkErrorLogger,
  installSdkErrorLogger,
  isContactUnsubscribed,
  redactEmails,
  upsertResendContact,
  withRateLimitRetry,
  type ResendContactsClient,
} from "./resend-contacts";

type Call = { method: string; args: Record<string, unknown> };
type Reply = { data: unknown; error: { statusCode: number | null; name: string; message: string } | null; headers: Record<string, string> | null };

const ok = (data: unknown): Reply => ({ data, error: null, headers: {} });
const err = (statusCode: number | null, name: string, headers: Record<string, string> = {}): Reply => ({
  data: null,
  error: { statusCode, name, message: name },
  headers,
});
const notFound = () => err(404, "not_found");
const rateLimited = (retryAfter?: string) =>
  err(429, "rate_limit_exceeded", retryAfter ? { "retry-after": retryAfter } : {});

// Fake Resend client: each method answers from its own queue of replies.
function fakeClient(replies: Partial<Record<string, Reply[]>>) {
  const calls: Call[] = [];
  const answer = (method: string) => async (args: Record<string, unknown>) => {
    calls.push({ method, args });
    const reply = replies[method]?.shift();
    if (!reply) throw new Error(`unexpected call: ${method}`);
    return reply;
  };
  const client = {
    contacts: {
      create: answer("create"),
      update: answer("update"),
      segments: { list: answer("segments.list"), add: answer("segments.add") },
    },
  } as unknown as ResendContactsClient;
  return { client, calls };
}

const noSleep = { sleep: async () => {} };

describe("isContactUnsubscribed", () => {
  it("maps SUBSCRIBED to unsubscribed=false", () => {
    assert.equal(isContactUnsubscribed("SUBSCRIBED"), false);
  });
  it("maps UNSUBSCRIBED and BOUNCED to unsubscribed=true", () => {
    assert.equal(isContactUnsubscribed("UNSUBSCRIBED"), true);
    assert.equal(isContactUnsubscribed("BOUNCED"), true);
  });
  it("treats a suppressed SUBSCRIBED email as unsubscribed", () => {
    assert.equal(isContactUnsubscribed("SUBSCRIBED", true), true);
  });
});

describe("upsertResendContact", () => {
  it("creates a new contact when none exists", async () => {
    const { client, calls } = fakeClient({
      update: [notFound()],
      create: [ok({ id: "c_new", object: "contact" })],
    });

    const result = await upsertResendContact(
      client,
      { email: " New@Example.com ", unsubscribed: false, firstName: "홍길동" },
      noSleep,
    );

    assert.deepEqual(result, { ok: true, contactId: "c_new", created: true });
    assert.deepEqual(
      calls.map((c) => c.method),
      ["update", "create"],
    );
    assert.deepEqual(calls[1].args, { email: "new@example.com", unsubscribed: false, firstName: "홍길동" });
  });

  it("updates an existing contact by email without creating a duplicate", async () => {
    const { client, calls } = fakeClient({ update: [ok({ id: "c_existing", object: "contact" })] });

    const result = await upsertResendContact(client, { email: "a@example.com", unsubscribed: false }, noSleep);

    assert.deepEqual(result, { ok: true, contactId: "c_existing", created: false });
    assert.deepEqual(
      calls.map((c) => c.method),
      ["update"],
    );
    assert.deepEqual(calls[0].args, { email: "a@example.com", unsubscribed: false });
  });

  it("uses the stored contact id first", async () => {
    const { client, calls } = fakeClient({ update: [ok({ id: "c_1", object: "contact" })] });

    const result = await upsertResendContact(
      client,
      { email: "a@example.com", unsubscribed: true, contactId: "c_1" },
      noSleep,
    );

    assert.deepEqual(result, { ok: true, contactId: "c_1", created: false });
    assert.deepEqual(calls[0].args, { id: "c_1", unsubscribed: true });
  });

  it("falls back to email when the stored id no longer exists", async () => {
    const { client, calls } = fakeClient({
      update: [notFound(), ok({ id: "c_2", object: "contact" })],
    });

    const result = await upsertResendContact(
      client,
      { email: "a@example.com", unsubscribed: false, contactId: "c_gone" },
      noSleep,
    );

    assert.deepEqual(result, { ok: true, contactId: "c_2", created: false });
    assert.deepEqual(calls[1].args, { email: "a@example.com", unsubscribed: false });
  });

  it("passes unsubscribed=true through for unsubscribes", async () => {
    const { client, calls } = fakeClient({ update: [ok({ id: "c_1", object: "contact" })] });

    await upsertResendContact(client, { email: "a@example.com", unsubscribed: true }, noSleep);

    assert.equal(calls[0].args.unsubscribed, true);
  });

  it("does not create a contact when createIfMissing is false", async () => {
    const { client, calls } = fakeClient({ update: [notFound()] });

    const result = await upsertResendContact(
      client,
      { email: "gone@example.com", unsubscribed: true, createIfMissing: false },
      noSleep,
    );

    assert.deepEqual(result, { ok: true, contactId: null, created: false });
    assert.deepEqual(
      calls.map((c) => c.method),
      ["update"],
    );
  });

  it("converges on the existing contact when create loses a race", async () => {
    const { client, calls } = fakeClient({
      update: [notFound(), ok({ id: "c_race", object: "contact" })],
      create: [err(409, "validation_error")],
    });

    const result = await upsertResendContact(client, { email: "a@example.com", unsubscribed: false }, noSleep);

    assert.deepEqual(result, { ok: true, contactId: "c_race", created: false });
    assert.deepEqual(
      calls.map((c) => c.method),
      ["update", "create", "update"],
    );
  });

  it("reports the create error when the follow-up update also fails", async () => {
    const { client } = fakeClient({
      update: [notFound(), notFound()],
      create: [err(422, "validation_error")],
    });

    const result = await upsertResendContact(client, { email: "bad", unsubscribed: false }, noSleep);

    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.error.includes("validation_error"));
    assert.ok(!result.ok && result.retryable === false);
  });

  it("retries 429 with backoff and then succeeds", async () => {
    const sleeps: number[] = [];
    const { client, calls } = fakeClient({
      update: [rateLimited(), rateLimited(), ok({ id: "c_1", object: "contact" })],
    });

    const result = await upsertResendContact(
      client,
      { email: "a@example.com", unsubscribed: false },
      { baseDelayMs: 100, sleep: async (ms) => void sleeps.push(ms) },
    );

    assert.deepEqual(result, { ok: true, contactId: "c_1", created: false });
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, [100, 200]);
  });

  it("returns a retryable failure once 429 retries are exhausted", async () => {
    const { client, calls } = fakeClient({ update: [rateLimited(), rateLimited(), rateLimited()] });

    const result = await upsertResendContact(
      client,
      { email: "a@example.com", unsubscribed: false },
      { maxRetries: 2, sleep: async () => {} },
    );

    assert.equal(calls.length, 3);
    assert.deepEqual(result, { ok: false, error: "rate_limit_exceeded: rate_limit_exceeded", retryable: true });
  });

  it("does not retry a daily quota error", async () => {
    const { client, calls } = fakeClient({ update: [err(429, "daily_quota_exceeded")] });

    const result = await upsertResendContact(client, { email: "a@example.com", unsubscribed: false }, noSleep);

    assert.equal(calls.length, 1);
    assert.ok(!result.ok && result.retryable === false);
  });

  it("marks network failures as retryable", async () => {
    const { client } = fakeClient({ update: [err(null, "application_error")] });

    const result = await upsertResendContact(client, { email: "a@example.com", unsubscribed: false }, noSleep);

    assert.ok(!result.ok && result.retryable === true);
  });

  it("never throws, even if the client does", async () => {
    const client = {
      contacts: {
        update: async () => {
          throw new Error("boom");
        },
      },
    } as unknown as ResendContactsClient;

    const result = await upsertResendContact(client, { email: "a@example.com", unsubscribed: false }, noSleep);

    assert.deepEqual(result, { ok: false, error: "boom", retryable: true });
  });

  it("adds a new contact to the segment at creation", async () => {
    const { client, calls } = fakeClient({
      update: [notFound()],
      create: [ok({ id: "c_new", object: "contact" })],
    });

    await upsertResendContact(client, { email: "a@example.com", unsubscribed: false, segmentId: "seg_1" }, noSleep);

    assert.deepEqual(calls[1].args.segments, [{ id: "seg_1" }]);
    assert.equal(calls.length, 2);
  });

  it("adds an existing contact to the segment only if it is missing", async () => {
    const missing = fakeClient({
      update: [ok({ id: "c_1", object: "contact" })],
      "segments.list": [ok({ object: "list", data: [], has_more: false })],
      "segments.add": [ok({ id: "seg_1" })],
    });
    await upsertResendContact(
      missing.client,
      { email: "a@example.com", unsubscribed: false, segmentId: "seg_1" },
      noSleep,
    );
    assert.deepEqual(
      missing.calls.map((c) => c.method),
      ["update", "segments.list", "segments.add"],
    );

    const present = fakeClient({
      update: [ok({ id: "c_1", object: "contact" })],
      "segments.list": [ok({ object: "list", data: [{ id: "seg_1", name: "News" }], has_more: false })],
    });
    await upsertResendContact(
      present.client,
      { email: "a@example.com", unsubscribed: false, segmentId: "seg_1" },
      noSleep,
    );
    assert.deepEqual(
      present.calls.map((c) => c.method),
      ["update", "segments.list"],
    );
  });
});

describe("withRateLimitRetry", () => {
  it("honors Retry-After when it is longer than the backoff", async () => {
    const sleeps: number[] = [];
    const replies = [rateLimited("3"), ok({ id: "x" })];

    const response = await withRateLimitRetry(async () => replies.shift() as Reply, {
      baseDelayMs: 100,
      sleep: async (ms) => void sleeps.push(ms),
    });

    assert.equal(response.error, null);
    assert.deepEqual(sleeps, [3000]);
  });

  it("caps backoff at maxDelayMs", async () => {
    const sleeps: number[] = [];
    const replies = [rateLimited(), rateLimited(), rateLimited(), ok({ id: "x" })];

    await withRateLimitRetry(async () => replies.shift() as Reply, {
      baseDelayMs: 1000,
      maxDelayMs: 1500,
      sleep: async (ms) => void sleeps.push(ms),
    });

    assert.deepEqual(sleeps, [1000, 1500, 1500]);
  });
});

describe("redactEmails", () => {
  it("masks email addresses and keeps the rest", () => {
    assert.equal(
      redactEmails("PATCH /contacts/Some.One+x@example.org failed for a@b.co"),
      "PATCH /contacts/<email> failed for <email>",
    );
    assert.equal(redactEmails("no address here"), "no address here");
  });
});

describe("createSdkErrorLogger", () => {
  const logged = () => {
    const lines: unknown[][] = [];
    return { lines, logger: createSdkErrorLogger((...args) => void lines.push(args)) };
  };

  it("drops the expected Contact-not-found lookup miss", () => {
    const { lines, logger } = logged();
    logger({ statusCode: 404, name: "not_found", message: "Contact not found" }, "/contacts/a@example.com", 404);
    assert.equal(lines.length, 0);
  });

  it("still logs real errors, with emails masked", () => {
    const { lines, logger } = logged();
    logger(
      { statusCode: 422, name: "validation_error", message: "Invalid email a@example.com" },
      "/contacts/a%40example.com",
      422,
    );
    assert.equal(lines.length, 1);
    const output = JSON.stringify(lines[0]);
    assert.ok(!output.includes("a@example.com") && !output.includes("a%40example.com"));
    assert.ok(output.includes("validation_error") && output.includes("<email>") && output.includes("422"));
  });

  it("still logs a 404 outside /contacts (e.g. a wrong segment id)", () => {
    const { lines, logger } = logged();
    logger({ statusCode: 404, name: "not_found", message: "Segment not found" }, "/segments/seg_1", 404);
    assert.equal(lines.length, 1);
  });
});

describe("installSdkErrorLogger on the real Resend SDK", () => {
  const realFetch = globalThis.fetch;
  const realConsoleError = console.error;
  afterEach(() => {
    globalThis.fetch = realFetch;
    console.error = realConsoleError;
  });

  // Guards the reliance on the SDK's private logError (resend ^6.18).
  it("the SDK still routes API errors through an overridable logError", () => {
    assert.equal(typeof (Resend.prototype as unknown as { logError?: unknown }).logError, "function");
  });

  it("keeps the lookup-miss email out of the console end to end", async () => {
    const consoleLines: string[] = [];
    console.error = (...args: unknown[]) => void consoleLines.push(JSON.stringify(args));
    const loggerLines: unknown[][] = [];

    globalThis.fetch = (async (url: string | URL) =>
      String(url).includes("/contacts/")
        ? new Response(JSON.stringify({ statusCode: 404, name: "not_found", message: "Contact not found" }), {
            status: 404,
          })
        : new Response(JSON.stringify({ statusCode: 500, name: "internal_server_error", message: "down" }), {
            status: 500,
          })) as typeof fetch;

    const resend = installSdkErrorLogger(
      new Resend("re_test"),
      createSdkErrorLogger((...args) => void loggerLines.push(args)),
    );

    const miss = await resend.contacts.update({ email: "secret.person@example.com", unsubscribed: false });
    assert.equal(miss.error?.name, "not_found");
    assert.equal(loggerLines.length, 0);

    const real = await resend.contacts.create({ email: "secret.person@example.com", unsubscribed: false });
    assert.equal(real.error?.name, "internal_server_error");
    assert.equal(loggerLines.length, 1);

    const everything = JSON.stringify(loggerLines) + consoleLines.join("");
    assert.ok(!everything.includes("secret.person"));
  });
});
