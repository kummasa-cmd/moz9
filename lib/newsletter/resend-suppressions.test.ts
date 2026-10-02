import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyAccountSuppression,
  classifySuppression,
  getAccountSuppression,
  listAccountSuppressions,
  lookupSourceBounce,
  parseAccountSuppression,
  parseEmailBounce,
  resolveProviderSuppression,
  suppressionRank,
  type SuppressionLookupClient,
} from "./resend-suppressions";

const NO_RETRY = { maxRetries: 0, sleep: async () => {} };

type Reply = { data: unknown; error: { name: string; message: string; statusCode: number | null } | null };
const ok = (data: unknown): Reply => ({ data, error: null });
const fail = (name: string, statusCode: number | null, message = "Something about kim@example.com"): Reply => ({
  data: null,
  error: { name, message, statusCode },
});

// Fake SDK slice: GET-only methods. Any other property (add / remove /
// batch ...) throws, so a test would fail loudly if this module ever wrote.
function fakeClient(handlers: {
  list?: (args: { limit?: number; after?: string }) => Reply;
  get?: (idOrEmail: string) => Reply;
  email?: (id: string) => Reply;
}) {
  const calls = { list: [] as unknown[], get: [] as string[], email: [] as string[] };
  const readOnly = <T extends object>(target: T) =>
    new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return obj[prop as keyof T];
        if (typeof prop === "symbol" || prop === "then") return undefined;
        throw new Error(`unexpected Resend call: ${String(prop)}`);
      },
    });
  const client = {
    suppressions: readOnly({
      list: async (args: { limit?: number; after?: string }) => {
        calls.list.push(args);
        return { ...(handlers.list ?? (() => ok({ object: "list", data: [], has_more: false })))(args), headers: {} };
      },
      get: async (idOrEmail: string) => {
        calls.get.push(idOrEmail);
        return { ...(handlers.get ?? (() => fail("not_found", 404)))(idOrEmail), headers: {} };
      },
    }),
    emails: readOnly({
      get: async (id: string) => {
        calls.email.push(id);
        return { ...(handlers.email ?? (() => fail("not_found", 404)))(id), headers: {} };
      },
    }),
  } as unknown as SuppressionLookupClient;
  return { client, calls };
}

function entry(n: number, extra: Record<string, unknown> = {}) {
  return {
    object: "suppression",
    id: `sup_${n}`,
    email: `User${n}@Example.com`,
    origin: "bounce",
    source_id: `email_${n}`,
    created_at: "2026-10-01T00:34:13Z",
    ...extra,
  };
}

const permanentEmail = ok({ id: "email_1", last_event: "bounced", bounce: { type: "Permanent", subType: "General", message: "hard bounce for kim@example.com" } });

describe("classifySuppression", () => {
  it("origin=complaint → COMPLAINT (verified)", () => {
    const c = classifySuppression({ origin: "complaint", sourceEmailId: "e", bounceLookup: null });
    assert.equal(c.reason, "COMPLAINT");
    assert.equal(c.verified, true);
  });

  it("origin=bounce + Permanent source bounce → BOUNCE with the bounce type", () => {
    const c = classifySuppression({
      origin: "bounce",
      sourceEmailId: "e",
      bounceLookup: { ok: true, bounce: { type: "Permanent", subType: "General" } },
    });
    assert.deepEqual(c, {
      reason: "BOUNCE",
      basis: "permanent_bounce",
      origin: "bounce",
      bounceType: "Permanent",
      bounceSubType: "General",
      verified: true,
    });
  });

  it("a Transient / Undetermined bounce is never BOUNCE", () => {
    for (const type of ["Transient", "Undetermined"]) {
      const c = classifySuppression({ origin: "bounce", sourceEmailId: "e", bounceLookup: { ok: true, bounce: { type, subType: null } } });
      assert.equal(c.reason, "PROVIDER_SUPPRESSED", type);
      assert.equal(c.basis, "non_permanent_bounce");
      assert.equal(c.bounceType, type);
    }
  });

  it("missing bounce field / failed lookup / no source / manual / unknown origin → PROVIDER_SUPPRESSED", () => {
    const cases = [
      [{ origin: "bounce", sourceEmailId: "e", bounceLookup: { ok: true, bounce: null } }, "bounce_type_missing", false],
      [{ origin: "bounce", sourceEmailId: "e", bounceLookup: { ok: false, error: "x" } }, "bounce_lookup_failed", false],
      [{ origin: "bounce", sourceEmailId: "e", bounceLookup: null }, "bounce_lookup_failed", false],
      [{ origin: "bounce", sourceEmailId: null, bounceLookup: null }, "bounce_without_source", false],
      [{ origin: "manual", sourceEmailId: null, bounceLookup: null }, "manual_origin", true],
      [{ origin: null, sourceEmailId: "e", bounceLookup: null }, "unknown_origin", false],
    ] as const;
    for (const [input, basis, verified] of cases) {
      const c = classifySuppression(input as Parameters<typeof classifySuppression>[0]);
      assert.equal(c.reason, "PROVIDER_SUPPRESSED", basis);
      assert.equal(c.basis, basis);
      assert.equal(c.verified, verified, basis);
    }
  });

  it("ranks UNSUBSCRIBE < PROVIDER_SUPPRESSED < BOUNCE < COMPLAINT", () => {
    const order = ["UNSUBSCRIBE", "PROVIDER_SUPPRESSED", "BOUNCE", "COMPLAINT"].map(suppressionRank);
    assert.deepEqual(order, [0, 1, 2, 3]);
  });
});

describe("parseEmailBounce — the bounce field isn't in the SDK types", () => {
  it("reads a well-formed field", () => {
    assert.deepEqual(parseEmailBounce({ bounce: { type: "Permanent", subType: "General", message: "m" } }), {
      type: "Permanent",
      subType: "General",
    });
  });

  it("returns null (never throws, never guesses) for missing or malformed shapes", () => {
    const shapes: unknown[] = [
      null,
      undefined,
      "Permanent",
      {},
      { bounce: null },
      { bounce: "Permanent" },
      { bounce: {} },
      { bounce: { type: 1 } },
      { bounce: { type: "" } },
      { bounce: { type: "Permanent bounce for kim@example.com" } },
      { bounce: { Type: "Permanent" } },
    ];
    for (const shape of shapes) assert.equal(parseEmailBounce(shape), null, JSON.stringify(shape));
  });

  it("drops an invalid subType but keeps the type", () => {
    assert.deepEqual(parseEmailBounce({ bounce: { type: "Permanent", subType: { x: 1 } } }), { type: "Permanent", subType: null });
  });
});

describe("parseAccountSuppression", () => {
  it("lower-cases the email and keeps ids", () => {
    assert.deepEqual(parseAccountSuppression(entry(1)), {
      id: "sup_1",
      email: "user1@example.com",
      origin: "bounce",
      sourceEmailId: "email_1",
      createdAt: "2026-10-01T00:34:13Z",
    });
  });

  it("an unknown origin becomes null; a missing id or email is rejected", () => {
    assert.equal(parseAccountSuppression(entry(1, { origin: "spamtrap" }))?.origin, null);
    assert.equal(parseAccountSuppression(entry(1, { id: "" })), null);
    assert.equal(parseAccountSuppression(entry(1, { email: "not-an-email" })), null);
  });
});

describe("listAccountSuppressions", () => {
  it("reads every page with the last id as cursor", async () => {
    const pages = [[entry(1), entry(2)], [entry(3)]];
    const { client, calls } = fakeClient({
      list: (args) => {
        const index = args.after ? 1 : 0;
        return ok({ object: "list", data: pages[index], has_more: index === 0 });
      },
    });
    const all = await listAccountSuppressions(client, NO_RETRY);
    assert.deepEqual(all.map((s) => s.id), ["sup_1", "sup_2", "sup_3"]);
    assert.equal((calls.list[1] as { after?: string }).after, "sup_2");
  });

  it("throws on an API error mid-way — never a partial list — without the error message", async () => {
    const { client } = fakeClient({
      list: (args) => (args.after ? fail("internal_server_error", 500) : ok({ object: "list", data: [entry(1)], has_more: true })),
    });
    await assert.rejects(listAccountSuppressions(client, NO_RETRY), (err: Error) => {
      assert.match(err.message, /internal_server_error \(500\)/);
      assert.equal(err.message.includes("@"), false);
      return true;
    });
  });

  it("throws on a page that doesn't advance or a malformed entry", async () => {
    const stuck = fakeClient({ list: () => ok({ object: "list", data: [entry(1)], has_more: true }) });
    await assert.rejects(listAccountSuppressions(stuck.client, NO_RETRY), /진행되지 않습니다/);
    const malformed = fakeClient({ list: () => ok({ object: "list", data: [{ id: "x" }], has_more: false }) });
    await assert.rejects(listAccountSuppressions(malformed.client, NO_RETRY), /형식/);
    const noData = fakeClient({ list: () => ok({ object: "list" }) });
    await assert.rejects(listAccountSuppressions(noData.client, NO_RETRY), /형식/);
  });
});

describe("single lookups", () => {
  it("getAccountSuppression: 404 means not on the list; other errors are failures", async () => {
    assert.deepEqual(await getAccountSuppression(fakeClient({}).client, "kim@example.com", NO_RETRY), { ok: true, suppression: null });
    const failed = await getAccountSuppression(fakeClient({ get: () => fail("restricted_api_key", 401) }).client, "kim@example.com", NO_RETRY);
    assert.deepEqual(failed, { ok: false, error: "restricted_api_key (401)" });
  });

  it("lookupSourceBounce never throws, even when the SDK call does", async () => {
    const throwing = {
      suppressions: { list: async () => ok(null), get: async () => ok(null) },
      emails: {
        get: async () => {
          throw new Error("socket hang up kim@example.com");
        },
      },
    } as unknown as SuppressionLookupClient;
    assert.deepEqual(await lookupSourceBounce(throwing, "email_1", NO_RETRY), { ok: false, error: "request_failed" });
  });

  it("classifyAccountSuppression looks the source email up only for bounces", async () => {
    const { client, calls } = fakeClient({ email: () => permanentEmail });
    const bounce = await classifyAccountSuppression(client, { origin: "bounce", sourceEmailId: "email_1" }, NO_RETRY);
    assert.equal(bounce.reason, "BOUNCE");
    const complaint = await classifyAccountSuppression(client, { origin: "complaint", sourceEmailId: "email_2" }, NO_RETRY);
    assert.equal(complaint.reason, "COMPLAINT");
    assert.deepEqual(calls.email, ["email_1"]);
  });

  it("a source email without the bounce field is PROVIDER_SUPPRESSED, not BOUNCE", async () => {
    const { client } = fakeClient({ email: () => ok({ id: "email_1", last_event: "bounced" }) });
    const c = await classifyAccountSuppression(client, { origin: "bounce", sourceEmailId: "email_1" }, NO_RETRY);
    assert.equal(c.reason, "PROVIDER_SUPPRESSED");
    assert.equal(c.basis, "bounce_type_missing");
  });
});

describe("resolveProviderSuppression (webhook)", () => {
  const check = (trigger: "email.suppressed" | "suppression.added", extra = {}) => ({
    trigger,
    email: "kim@example.com",
    suppressionId: null,
    origin: null,
    sourceEmailId: null,
    ...extra,
  });

  it("suppression.added classifies from the payload without a suppression lookup", async () => {
    const { client, calls } = fakeClient({ email: () => permanentEmail });
    const r = await resolveProviderSuppression(
      client,
      check("suppression.added", { suppressionId: "sup_9", origin: "bounce", sourceEmailId: "email_1" }),
      NO_RETRY,
    );
    assert.equal(r.state, "suppressed");
    if (r.state === "suppressed") {
      assert.equal(r.classification.reason, "BOUNCE");
      assert.equal(r.suppressionId, "sup_9");
    }
    assert.equal(calls.get.length, 0);
  });

  it("email.suppressed looks the address up: 404 → not suppressed any more", async () => {
    const { client } = fakeClient({});
    assert.deepEqual(await resolveProviderSuppression(client, check("email.suppressed"), NO_RETRY), { state: "not_suppressed" });
  });

  it("email.suppressed with an unreadable list fails closed (PROVIDER_SUPPRESSED, unverified)", async () => {
    const { client } = fakeClient({ get: () => fail("internal_server_error", 500) });
    const r = await resolveProviderSuppression(client, check("email.suppressed"), NO_RETRY);
    assert.equal(r.state, "suppressed");
    if (r.state === "suppressed") {
      assert.equal(r.classification.reason, "PROVIDER_SUPPRESSED");
      assert.equal(r.classification.basis, "suppression_lookup_failed");
      assert.equal(r.classification.verified, false);
    }
  });

  it("email.suppressed on a complaint suppression → COMPLAINT with the suppression id", async () => {
    const { client } = fakeClient({ get: () => ok(entry(4, { email: "kim@example.com", origin: "complaint" })) });
    const r = await resolveProviderSuppression(client, check("email.suppressed"), NO_RETRY);
    assert.equal(r.state === "suppressed" && r.classification.reason, "COMPLAINT");
    assert.equal(r.state === "suppressed" && r.suppressionId, "sup_4");
  });
});
