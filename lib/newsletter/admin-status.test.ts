import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_STATUS_BLOCKED_MESSAGE, adminSetSubscriberStatus, isAdminStatus } from "./admin-status";

// The rules live in newsletter_admin_set_status (tested against Postgres in
// subscription-sql.test.ts); this checks the wrapper maps its outcomes and
// never falls back to a direct table write.

function rpcDb(reply: { data: unknown; error: { message: string } | null }) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return reply;
    },
    from: () => {
      throw new Error("admin status change must not write tables directly");
    },
  };
  return { db: db as never, calls };
}

describe("adminSetSubscriberStatus", () => {
  it("calls the SQL function with the id and status", async () => {
    const { db, calls } = rpcDb({ data: [{ outcome: "updated", subscriber_id: "sub-1" }], error: null });
    const result = await adminSetSubscriberStatus(db, "sub-1", "UNSUBSCRIBED");
    assert.deepEqual(result, { ok: true, outcome: "updated", subscriberId: "sub-1" });
    assert.deepEqual(calls, [{ fn: "newsletter_admin_set_status", args: { p_subscriber_id: "sub-1", p_status: "UNSUBSCRIBED" } }]);
  });

  it("a protected row (BOUNCE / COMPLAINT / PROVIDER_SUPPRESSED) comes back blocked with an admin message", async () => {
    const { db } = rpcDb({ data: [{ outcome: "blocked", subscriber_id: "sub-1" }], error: null });
    assert.deepEqual(await adminSetSubscriberStatus(db, "sub-1", "SUBSCRIBED"), {
      ok: false,
      outcome: "blocked",
      message: ADMIN_STATUS_BLOCKED_MESSAGE,
    });
  });

  it("a missing function (0030 not applied) fails instead of bypassing the protection", async () => {
    const { db, calls } = rpcDb({ data: null, error: { message: "function public.newsletter_admin_set_status does not exist" } });
    const result = await adminSetSubscriberStatus(db, "sub-1", "SUBSCRIBED");
    assert.equal(result.ok, false);
    assert.equal(result.outcome, "error");
    assert.equal(calls.length, 1);
  });

  it("unchanged / not_found / unreadable outcomes", async () => {
    assert.equal((await adminSetSubscriberStatus(rpcDb({ data: { outcome: "unchanged", subscriber_id: "s" }, error: null }).db, "s", "SUBSCRIBED")).ok, true);
    assert.equal((await adminSetSubscriberStatus(rpcDb({ data: [{ outcome: "not_found" }], error: null }).db, "s", "SUBSCRIBED")).outcome, "not_found");
    assert.equal((await adminSetSubscriberStatus(rpcDb({ data: [], error: null }).db, "s", "SUBSCRIBED")).outcome, "error");
  });

  it("only SUBSCRIBED / UNSUBSCRIBED / BOUNCED are admin targets — never SUPPRESSED", () => {
    assert.deepEqual(["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED", "SUPPRESSED", ""].map(isAdminStatus), [true, true, true, false, false]);
  });
});
