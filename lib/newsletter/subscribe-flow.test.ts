import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isMissingFunctionError,
  mapSubscribeRpcRow,
  runSubscribeAction,
  subscribeViaRpc,
  type SubscribeResult,
} from "./subscribe-flow";

function action(result: SubscribeResult) {
  const synced: string[] = [];
  const logs: unknown[][] = [];
  const run = (email = "kim@example.com") =>
    runSubscribeAction(
      { email },
      {
        subscribe: async () => result,
        scheduleContactSync: (id) => synced.push(id),
        logError: (...args) => logs.push(args),
      },
    );
  return { run, synced, logs };
}

describe("mapSubscribeRpcRow", () => {
  it("maps a new signup", () => {
    assert.deepEqual(mapSubscribeRpcRow({ result: "created", subscriber_id: "s1", needs_contact_sync: true }), {
      ok: true,
      alreadySubscribed: false,
      subscriberId: "s1",
      needsContactSync: true,
    });
  });

  it("maps a re-subscribe after an UNSUBSCRIBE suppression", () => {
    assert.deepEqual(mapSubscribeRpcRow({ result: "reactivated", subscriber_id: "s1", needs_contact_sync: true }), {
      ok: true,
      alreadySubscribed: false,
      subscriberId: "s1",
      needsContactSync: true,
    });
  });

  it("maps an already subscribed address", () => {
    assert.deepEqual(mapSubscribeRpcRow({ result: "already", subscriber_id: "s1", needs_contact_sync: false }), {
      ok: true,
      alreadySubscribed: true,
      subscriberId: "s1",
      needsContactSync: false,
    });
  });

  it("maps a blocked (COMPLAINT / BOUNCE) address with no sync and no subscriber id", () => {
    assert.deepEqual(mapSubscribeRpcRow({ result: "blocked", subscriber_id: null, needs_contact_sync: false }), {
      ok: true,
      alreadySubscribed: false,
      subscriberId: null,
      needsContactSync: false,
      blocked: true,
    });
  });

  it("treats anything unexpected as an error", () => {
    assert.equal(mapSubscribeRpcRow(null).ok, false);
    assert.equal(mapSubscribeRpcRow({ result: "weird", subscriber_id: null, needs_contact_sync: false }).ok, false);
  });
});

describe("runSubscribeAction", () => {
  it("a new email subscribes and schedules the Resend Contact sync", async () => {
    const { run, synced } = action({ ok: true, alreadySubscribed: false, subscriberId: "s1", needsContactSync: true });
    assert.deepEqual(await run(), { ok: true, alreadySubscribed: false });
    assert.deepEqual(synced, ["s1"]);
  });

  it("an UNSUBSCRIBE-suppressed address re-subscribes and syncs the Contact back to subscribed", async () => {
    const { run, synced } = action(mapSubscribeRpcRow({ result: "reactivated", subscriber_id: "s2", needs_contact_sync: true }));
    assert.deepEqual(await run(), { ok: true, alreadySubscribed: false });
    assert.deepEqual(synced, ["s2"]);
  });

  it("a blocked address gets the same answer as a new signup and no Resend call", async () => {
    const blocked = action(mapSubscribeRpcRow({ result: "blocked", subscriber_id: null, needs_contact_sync: false }));
    const fresh = action(mapSubscribeRpcRow({ result: "created", subscriber_id: "s3", needs_contact_sync: true }));
    const blockedResponse = await blocked.run();
    assert.deepEqual(blockedResponse, await fresh.run());
    assert.deepEqual(blocked.synced, []);
    // Nothing about suppression or the reason leaks into the response.
    assert.equal(/COMPLAINT|BOUNCE|suppress|차단|반송|신고/i.test(JSON.stringify(blockedResponse)), false);
  });

  it("a blocked result never syncs even if it somehow carries an id", async () => {
    const { run, synced } = action({ ok: true, alreadySubscribed: false, subscriberId: "s4", needsContactSync: true, blocked: true });
    await run();
    assert.deepEqual(synced, []);
  });

  it("an already subscribed address only syncs when asked to", async () => {
    const quiet = action({ ok: true, alreadySubscribed: true, subscriberId: "s5", needsContactSync: false });
    assert.deepEqual(await quiet.run(), { ok: true, alreadySubscribed: true });
    assert.deepEqual(quiet.synced, []);
  });

  it("a DB failure returns a generic error and logs it", async () => {
    const { run, synced, logs } = action({ ok: false, error: "connection refused" });
    assert.deepEqual(await run(), { ok: false, error: "구독 신청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
    assert.deepEqual(synced, []);
    assert.equal(logs.length, 1);
  });
});

describe("isMissingFunctionError", () => {
  it("recognises a not-yet-migrated database", () => {
    assert.equal(isMissingFunctionError({ code: "PGRST202" }), true);
    assert.equal(isMissingFunctionError({ code: "42883" }), true);
    assert.equal(isMissingFunctionError({ code: "23505" }), false);
    assert.equal(isMissingFunctionError(null), false);
  });
});

describe("subscribeViaRpc — fail-closed, no table fallback", () => {
  function rpcDb(reply: { data: unknown; error: { code?: string; message: string } | null }) {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return reply;
      },
      // The old pre-0029 path read / updated newsletter_subscribers and
      // deleted newsletter_suppressions directly. It must never run again.
      from: () => {
        throw new Error("no table access on the subscribe path");
      },
    };
    return { db, calls };
  }

  it("calls newsletter_subscribe with the normalized email", async () => {
    const { db, calls } = rpcDb({ data: [{ result: "created", subscriber_id: "s1", needs_contact_sync: true }], error: null });
    const result = await subscribeViaRpc(db, { email: " Kim@Example.com ", source: "WEBSITE" });
    assert.deepEqual(result, { ok: true, alreadySubscribed: false, subscriberId: "s1", needsContactSync: true });
    assert.equal(calls[0].fn, "newsletter_subscribe");
    assert.equal(calls[0].args.p_email, "kim@example.com");
  });

  for (const code of ["PGRST202", "42883"]) {
    it(`a missing function (${code}, e.g. a stale schema cache mid-migration) fails the signup instead of lifting suppressions`, async () => {
      const { db, calls } = rpcDb({ data: null, error: { code, message: "Could not find the function" } });
      const original = console.error;
      console.error = () => {};
      try {
        const result = await subscribeViaRpc(db, { email: "kim@example.com", source: "WEBSITE" });
        assert.equal(result.ok, false);
      } finally {
        console.error = original;
      }
      assert.equal(calls.length, 1);
    });
  }

  it("a blocked address stays blocked", async () => {
    const { db } = rpcDb({ data: [{ result: "blocked", subscriber_id: null, needs_contact_sync: false }], error: null });
    const result = await subscribeViaRpc(db, { email: "kim@example.com", source: "WEBSITE" });
    assert.equal(result.ok && result.blocked, true);
  });
});
