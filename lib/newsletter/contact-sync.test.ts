import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildContactSyncQueue, syncSubscriberRow, type SubscriberSyncRow } from "./contact-sync";
import { isSuppressionNewerThanSync } from "./resend-contacts";
import { evaluateBroadcastPreflight } from "./broadcast-preflight";
import type { ResendContactsClient } from "./resend-contacts";

type Write = { table: string; patch: Record<string, unknown>; filters: [string, unknown][] };

// Minimal PostgREST-builder fake: records update() calls and answers the
// suppression lookup.
function fakeDb(options: { suppressed?: boolean } = {}) {
  const writes: Write[] = [];
  const db = {
    from(table: string) {
      return {
        update(patch: Record<string, unknown>) {
          const write: Write = { table, patch, filters: [] };
          writes.push(write);
          const chain = {
            eq(column: string, value: unknown) {
              write.filters.push([column, value]);
              return chain;
            },
            then(resolve: (value: { error: null }) => void) {
              resolve({ error: null });
            },
          };
          return chain;
        },
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({
                  data: options.suppressed ? { email: "x" } : null,
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, writes };
}

function fakeResend(update: () => Promise<unknown>) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    contacts: {
      update: async (args: Record<string, unknown>) => {
        calls.push(args);
        return update();
      },
      create: async () => ({ data: { id: "c_new" }, error: null, headers: {} }),
    },
  } as unknown as ResendContactsClient;
  return { client, calls };
}

const row = (overrides: Partial<SubscriberSyncRow> = {}): SubscriberSyncRow => ({
  id: "sub_1",
  email: "a@example.com",
  name: null,
  status: "SUBSCRIBED",
  resend_contact_id: null,
  resend_synced_at: null,
  resend_sync_error: null,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const noRetry = { maxRetries: 0, sleep: async () => {} };

describe("syncSubscriberRow", () => {
  it("records contact id and synced_at on success, guarded by the pushed status", async () => {
    const { db, writes } = fakeDb();
    const { client } = fakeResend(async () => ({ data: { id: "c_1" }, error: null, headers: {} }));

    const result = await syncSubscriberRow(row(), { db, client, retry: noRetry });

    assert.equal(result.ok, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].patch.resend_contact_id, "c_1");
    assert.equal(writes[0].patch.resend_sync_error, null);
    assert.ok(typeof writes[0].patch.resend_synced_at === "string");
    assert.deepEqual(writes[0].filters, [
      ["id", "sub_1"],
      ["status", "SUBSCRIBED"],
    ]);
  });

  it("on Resend failure only records resend_sync_error — status is never touched", async () => {
    const { db, writes } = fakeDb();
    const { client } = fakeResend(async () => ({
      data: null,
      error: { statusCode: 500, name: "internal_server_error", message: "down" },
      headers: {},
    }));

    const result = await syncSubscriberRow(row({ status: "UNSUBSCRIBED" }), { db, client, retry: noRetry });

    assert.equal(result.ok, false);
    assert.equal(writes.length, 1);
    assert.deepEqual(Object.keys(writes[0].patch), ["resend_sync_error"]);
    assert.match(String(writes[0].patch.resend_sync_error), /internal_server_error/);
  });

  it("pushes unsubscribed=true for UNSUBSCRIBED rows", async () => {
    const { db } = fakeDb();
    const { client, calls } = fakeResend(async () => ({ data: { id: "c_1" }, error: null, headers: {} }));

    await syncSubscriberRow(row({ status: "UNSUBSCRIBED", resend_contact_id: "c_1" }), {
      db,
      client,
      retry: noRetry,
    });

    assert.deepEqual(calls[0], { id: "c_1", unsubscribed: true });
  });

  it("pushes unsubscribed=true for a SUBSCRIBED row on the suppression list", async () => {
    const { db } = fakeDb({ suppressed: true });
    const { client, calls } = fakeResend(async () => ({ data: { id: "c_1" }, error: null, headers: {} }));

    await syncSubscriberRow(row(), { db, client, retry: noRetry });

    assert.equal(calls[0].unsubscribed, true);
  });
});

// ---------------------------------------------------------------------------
// B1: suppressed-after-sync rows join the retry queue and converge
// ---------------------------------------------------------------------------

function syncRow(overrides: Partial<SubscriberSyncRow> = {}): SubscriberSyncRow {
  return {
    id: "sub_1",
    email: "kim@example.com",
    name: null,
    status: "SUBSCRIBED",
    resend_contact_id: "c_1",
    resend_synced_at: "2026-09-30T00:00:00Z",
    resend_sync_error: null,
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("isSuppressionNewerThanSync", () => {
  it("is stale only when the suppression came after the last sync", () => {
    assert.equal(isSuppressionNewerThanSync("2026-09-30T00:00:00Z", null), false);
    assert.equal(isSuppressionNewerThanSync(null, "2026-09-30T00:00:00Z"), true);
    assert.equal(isSuppressionNewerThanSync("2026-09-30T00:00:00Z", "2026-09-30T00:00:01Z"), true);
    assert.equal(isSuppressionNewerThanSync("2026-09-30T00:00:01Z", "2026-09-30T00:00:00Z"), false);
    // Same transaction (e.g. the webhook opt-out function) → in sync.
    assert.equal(isSuppressionNewerThanSync("2026-09-30T00:00:00Z", "2026-09-30T00:00:00Z"), false);
  });
});

describe("buildContactSyncQueue", () => {
  const suppressedAt = new Map([["kim@example.com", "2026-09-30T05:00:00Z"]]);

  it("adds a SUBSCRIBED row suppressed after its last successful sync (regression)", () => {
    const queue = buildContactSyncQueue([], [syncRow()], suppressedAt, 50);
    assert.deepEqual(queue.map((r) => r.id), ["sub_1"]);
  });

  it("skips it once it has been synced after the suppression", () => {
    const queue = buildContactSyncQueue([], [syncRow({ resend_synced_at: "2026-09-30T06:00:00Z" })], suppressedAt, 50);
    assert.deepEqual(queue, []);
  });

  it("keeps pending rows first, dedupes, ignores non-SUBSCRIBED rows and caps the size", () => {
    const pending = [syncRow({ id: "p1", resend_synced_at: null }), syncRow({ id: "sub_1", resend_synced_at: null })];
    const extra = [syncRow(), syncRow({ id: "u1", status: "UNSUBSCRIBED" }), syncRow({ id: "s2" })];
    const queue = buildContactSyncQueue(pending, extra, suppressedAt, 3);
    assert.deepEqual(queue.map((r) => r.id), ["p1", "sub_1", "s2"]);
    assert.equal(buildContactSyncQueue(pending, extra, suppressedAt, 1).length, 1);
  });
});

describe("B1 end-to-end: suppression → failed sync → cron retry → preflight", () => {
  it("blocks the Broadcast until the retry converges Resend to unsubscribed, then passes", async () => {
    // A prospect-token unsubscribe suppressed an address that is also a
    // SUBSCRIBED subscriber; the immediate sync failed.
    let row = syncRow({ resend_synced_at: null, resend_sync_error: "rate_limit_exceeded: Too many requests" });
    const suppressions = [{ email: row.email, unsubscribed_at: "2026-09-30T05:00:00Z" }];
    let resendUnsubscribed = false; // what Resend currently holds for the Contact

    const segment = () => [{ id: "c_1", email: row.email, unsubscribed: resendUnsubscribed }];
    const preflight = () =>
      evaluateBroadcastPreflight({ subscribers: [row], suppressions, segmentContacts: segment(), accountSuppressions: [] });

    // 3rd line: before recovery the Broadcast is blocked.
    const before = preflight();
    assert.equal(before.ok, false);
    assert.deepEqual(
      before.blocking.map((i) => i.code),
      ["RESEND_SUBSCRIBED_NOT_ELIGIBLE", "NOT_ELIGIBLE_UNSYNCED"],
    );

    // 2nd line: the row is in the retry queue.
    const suppressedAt = new Map(suppressions.map((s) => [s.email, s.unsubscribed_at]));
    assert.deepEqual(buildContactSyncQueue([row], [row], suppressedAt, 50).map((r) => r.id), ["sub_1"]);

    // Next cron run succeeds: Resend gets unsubscribed=true, the row is marked synced.
    const { db, writes } = fakeDb({ suppressed: true });
    const { client, calls } = fakeResend(async () => {
      resendUnsubscribed = true;
      return { data: { id: "c_1" }, error: null, headers: {} };
    });
    const result = await syncSubscriberRow(row, { db, client });
    assert.equal(result.ok, true);
    assert.equal(calls[0].unsubscribed, true);
    const syncedAt = writes[0].patch.resend_synced_at as string;
    row = { ...row, resend_synced_at: syncedAt, resend_sync_error: null };

    // Converged: not queued any more, and the preflight now passes (the
    // address is simply not a recipient).
    assert.deepEqual(buildContactSyncQueue([], [row], suppressedAt, 50), []);
    const after = preflight();
    assert.equal(after.ok, true);
    assert.equal(after.segmentSubscribed, 0);
  });
});
