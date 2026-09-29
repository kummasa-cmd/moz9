import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncSubscriberRow, type SubscriberSyncRow } from "./contact-sync";
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
