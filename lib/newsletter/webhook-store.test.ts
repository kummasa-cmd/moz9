import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STALE_CLAIM_MS, createWebhookStore } from "./webhook-store";

// Recording PostgREST-builder fake: every chain is captured as a list of
// [method, ...args] and answered by `respond`, so tests can assert both the
// filters the store sends and how it reacts to each answer.
type Op = [string, ...unknown[]];
type Query = { table: string; ops: Op[] };
type Answer = { data: unknown; error: { code?: string; message: string } | null };

function fakeDb(respond: (query: Query, index: number) => Answer) {
  const queries: Query[] = [];
  const db = {
    from(table: string) {
      const query: Query = { table, ops: [] };
      queries.push(query);
      const index = queries.length - 1;
      const builder: Record<string, unknown> = {};
      for (const method of ["insert", "update", "upsert", "select", "eq", "in", "is"]) {
        builder[method] = (...args: unknown[]) => {
          query.ops.push([method, ...args]);
          return builder;
        };
      }
      const finish = (method: string) => async () => {
        query.ops.push([method]);
        return respond(query, index);
      };
      builder.single = finish("single");
      builder.maybeSingle = finish("maybeSingle");
      builder.then = (resolve: (value: Answer) => void) => resolve(respond(query, index));
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, queries };
}

const has = (query: Query, method: string, ...args: unknown[]) =>
  query.ops.some(([m, ...a]) => m === method && JSON.stringify(a) === JSON.stringify(args));

const NOW = new Date("2026-10-01T00:00:00Z");
const clock = () => NOW;

describe("createWebhookStore.claim", () => {
  it("claims a new event", async () => {
    const { db, queries } = fakeDb(() => ({ data: { id: "ev_1" }, error: null }));
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "email.opened", eventCreatedAt: null });
    assert.deepEqual(result, { state: "claimed", eventId: "ev_1" });
    assert.equal(queries.length, 1);
  });

  it("reports an already processed event as done", async () => {
    const { db } = fakeDb((_q, i) =>
      i === 0
        ? { data: null, error: { code: "23505", message: "duplicate" } }
        : { data: { id: "ev_1", status: "PROCESSED", processing_started_at: NOW.toISOString(), attempts: 1 }, error: null },
    );
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null });
    assert.deepEqual(result, { state: "done", status: "PROCESSED" });
  });

  it("re-claims a FAILED event only if it is still FAILED", async () => {
    const started = "2026-09-30T23:59:00.000Z";
    const { db, queries } = fakeDb((_q, i) => {
      if (i === 0) return { data: null, error: { code: "23505", message: "duplicate" } };
      if (i === 1) return { data: { id: "ev_1", status: "FAILED", processing_started_at: started, attempts: 1 }, error: null };
      return { data: { id: "ev_1" }, error: null };
    });
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null });
    assert.deepEqual(result, { state: "claimed", eventId: "ev_1" });
    const update = queries[2];
    assert.ok(has(update, "eq", "status", "FAILED"));
    assert.ok(has(update, "eq", "processing_started_at", started));
    assert.equal((update.ops.find(([m]) => m === "update")![1] as { attempts: number }).attempts, 2);
  });

  it("leaves a fresh PROCESSING event alone", async () => {
    const { db, queries } = fakeDb((_q, i) =>
      i === 0
        ? { data: null, error: { code: "23505", message: "duplicate" } }
        : { data: { id: "ev_1", status: "PROCESSING", processing_started_at: new Date(NOW.getTime() - 1000).toISOString(), attempts: 1 }, error: null },
    );
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null });
    assert.deepEqual(result, { state: "in_progress" });
    assert.equal(queries.length, 2);
  });

  it("re-claims an abandoned PROCESSING event after the stale timeout", async () => {
    const old = new Date(NOW.getTime() - STALE_CLAIM_MS - 1000).toISOString();
    const { db } = fakeDb((_q, i) => {
      if (i === 0) return { data: null, error: { code: "23505", message: "duplicate" } };
      if (i === 1) return { data: { id: "ev_1", status: "PROCESSING", processing_started_at: old, attempts: 1 }, error: null };
      return { data: { id: "ev_1" }, error: null };
    });
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null });
    assert.deepEqual(result, { state: "claimed", eventId: "ev_1" });
  });

  it("loses the re-claim race gracefully", async () => {
    const { db } = fakeDb((_q, i) => {
      if (i === 0) return { data: null, error: { code: "23505", message: "duplicate" } };
      if (i === 1) return { data: { id: "ev_1", status: "FAILED", processing_started_at: NOW.toISOString(), attempts: 1 }, error: null };
      return { data: null, error: null };
    });
    const result = await createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null });
    assert.deepEqual(result, { state: "in_progress" });
  });

  it("throws on other insert errors (→ 500, Resend retries)", async () => {
    const { db } = fakeDb(() => ({ data: null, error: { code: "08006", message: "connection failure" } }));
    await assert.rejects(createWebhookStore(db, clock).claim({ svixId: "msg_1", eventType: "x", eventCreatedAt: null }));
  });
});

describe("createWebhookStore.applySubscriberChange", () => {
  it("calls the atomic opt-out function with the mapped suppression reason", async () => {
    const { db, calls } = fakeRpc({ data: [{ outcome: "updated", subscriber_id: "sub_1" }], error: null });
    const result = await createWebhookStore(db, clock).applySubscriberChange(
      { status: "UNSUBSCRIBED", reason: "resend_unsubscribe", email: "lee@example.com" },
      { eventAt: "2026-10-01T00:00:00Z", contactId: "c_1" },
    );
    assert.deepEqual(result, { outcome: "updated", subscriberId: "sub_1" });
    assert.deepEqual(calls, [
      [
        "newsletter_apply_resend_opt_out",
        { p_email: "lee@example.com", p_status: "UNSUBSCRIBED", p_reason: "UNSUBSCRIBE", p_event_at: "2026-10-01T00:00:00Z", p_contact_id: "c_1" },
      ],
    ]);
  });

  it("maps complaint and permanent bounce to their suppression reasons", async () => {
    const { db, calls } = fakeRpc({ data: [{ outcome: "not_found", subscriber_id: null }], error: null });
    const store = createWebhookStore(db, clock);
    await store.applySubscriberChange({ status: "UNSUBSCRIBED", reason: "complaint", email: "a@example.com" }, { eventAt: null, contactId: null });
    await store.applySubscriberChange({ status: "BOUNCED", reason: "permanent_bounce", email: "a@example.com" }, { eventAt: null, contactId: null });
    assert.equal((calls[0][1] as { p_reason: string }).p_reason, "COMPLAINT");
    assert.equal((calls[1][1] as { p_reason: string }).p_reason, "BOUNCE");
  });

  it("throws on DB errors and on unexpected results (→ 500, Resend retries)", async () => {
    const change = { status: "UNSUBSCRIBED" as const, reason: "complaint" as const, email: "a@example.com" };
    await assert.rejects(createWebhookStore(fakeRpc({ data: null, error: { message: "boom" } }).db, clock).applySubscriberChange(change, { eventAt: null, contactId: null }));
    await assert.rejects(createWebhookStore(fakeRpc({ data: [{ outcome: "weird" }], error: null }).db, clock).applySubscriberChange(change, { eventAt: null, contactId: null }));
  });
});

function fakeRpc(answer: Answer) {
  const calls: unknown[][] = [];
  const db = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return answer;
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}
