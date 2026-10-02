import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveSuppressionReason,
  isReconciled,
  maskEmail,
  planStatusChange,
  reconcileProviderSuppressions,
  summarizeReconcile,
  type LocalSuppression,
  type ProviderSuppressionApplyInput,
  type ReconcileStore,
  type ReconcileSubscriber,
} from "./suppression-reconcile";
import { runContactSyncCycle, type ContactSyncCycleDeps } from "./contact-sync";
import type { SuppressionLookupClient } from "./resend-suppressions";

const NO_WAIT = { delayMs: 0, retry: { maxRetries: 0, sleep: async () => {} } };

type Reply = { data: unknown; error: { name: string; message: string; statusCode: number | null } | null; headers: Record<string, string> };
const ok = (data: unknown): Reply => ({ data, error: null, headers: {} });
const fail = (name: string, statusCode: number): Reply => ({ data: null, error: { name, message: "x", statusCode }, headers: {} });

type Suppression = { id: string; email: string; origin: string; source_id: string | null };

// Read-only fake of the Resend SDK slice. Records every call; any property
// that isn't a known GET (add / remove / batch / contacts ...) throws.
function resend(options: {
  pages: Suppression[][];
  bounces?: Record<string, unknown>;
  listFailsAtPage?: number;
  emailFails?: Set<string>;
}) {
  const calls: string[] = [];
  const readOnly = <T extends object>(name: string, target: T) =>
    new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return obj[prop as keyof T];
        if (typeof prop === "symbol" || prop === "then") return undefined;
        calls.push(`UNEXPECTED ${name}.${String(prop)}`);
        throw new Error(`unexpected Resend call: ${name}.${String(prop)}`);
      },
    });
  const client = readOnly("resend", {
    suppressions: readOnly("suppressions", {
      list: async (args: { after?: string }) => {
        const index = args.after ? options.pages.findIndex((p) => p.some((s) => s.id === args.after)) + 1 : 0;
        calls.push(`suppressions.list#${index}`);
        if (options.listFailsAtPage === index) return fail("internal_server_error", 500);
        return ok({ object: "list", data: options.pages[index].map((s) => ({ object: "suppression", created_at: "2026-10-01", ...s })), has_more: index < options.pages.length - 1 });
      },
      get: async () => {
        calls.push("suppressions.get");
        return fail("not_found", 404);
      },
    }),
    emails: readOnly("emails", {
      get: async (id: string) => {
        calls.push(`emails.get:${id}`);
        if (options.emailFails?.has(id)) return fail("internal_server_error", 500);
        return ok({ id, last_event: "bounced", ...(options.bounces?.[id] ? { bounce: options.bounces[id] } : {}) });
      },
    }),
  }) as unknown as SuppressionLookupClient;
  return { client, calls };
}

const PERMANENT = { type: "Permanent", subType: "General", message: "m" };
const TRANSIENT = { type: "Transient", subType: "General", message: "m" };

function memoryStore(subscribers: ReconcileSubscriber[], locals: LocalSuppression[] = [], options: { failFor?: Set<string> } = {}) {
  const applied: ProviderSuppressionApplyInput[] = [];
  const store: ReconcileStore = {
    loadSubscribers: async () => subscribers,
    loadLocalSuppressions: async () => locals,
    applyProviderSuppression: async (input) => {
      if (options.failFor?.has(input.email)) throw new Error(`db down while writing ${input.email}`);
      applied.push(input);
      const row = subscribers.find((s) => s.email === input.email);
      if (!row) return { outcome: "not_found", subscriberId: null, previousStatus: null, newStatus: null, effectiveReason: null };
      const plan = planStatusChange(row.status, input.classification.reason);
      const previous = row.status;
      row.status = plan.newStatus;
      return {
        outcome: plan.statusChange ? "updated" : "already",
        subscriberId: row.id,
        previousStatus: previous,
        newStatus: row.status,
        effectiveReason: input.classification.reason,
      };
    },
  };
  return { store, applied };
}

const sub = (n: number, status = "SUBSCRIBED"): ReconcileSubscriber => ({ id: `sub-${n}`, email: `user${n}@example.com`, status });
const sup = (n: number, origin = "bounce", sourceId: string | null = `email_${n}`): Suppression => ({
  id: `sup_${n}`,
  email: `User${n}@Example.com`,
  origin,
  source_id: sourceId,
});

describe("planStatusChange / effectiveSuppressionReason (mirror the SQL function)", () => {
  it("moves SUBSCRIBED rows to the reason's status and unsubscribes their Contact", () => {
    assert.deepEqual(planStatusChange("SUBSCRIBED", "BOUNCE"), { targetStatus: "BOUNCED", newStatus: "BOUNCED", statusChange: true, contactChange: true });
    assert.equal(planStatusChange("SUBSCRIBED", "COMPLAINT").newStatus, "UNSUBSCRIBED");
    assert.equal(planStatusChange("SUBSCRIBED", "PROVIDER_SUPPRESSED").newStatus, "SUPPRESSED");
  });

  it("upgrades SUPPRESSED once confirmed, without another Contact change; leaves others alone", () => {
    assert.deepEqual(planStatusChange("SUPPRESSED", "BOUNCE"), { targetStatus: "BOUNCED", newStatus: "BOUNCED", statusChange: true, contactChange: false });
    assert.equal(planStatusChange("SUPPRESSED", "PROVIDER_SUPPRESSED").statusChange, false);
    assert.equal(planStatusChange("UNSUBSCRIBED", "BOUNCE").statusChange, false);
    assert.equal(planStatusChange("BOUNCED", "PROVIDER_SUPPRESSED").statusChange, false);
  });

  it("a lower-priority reason never replaces a stronger stored one", () => {
    assert.equal(effectiveSuppressionReason("COMPLAINT", "BOUNCE"), "COMPLAINT");
    assert.equal(effectiveSuppressionReason("BOUNCE", "PROVIDER_SUPPRESSED"), "BOUNCE");
    assert.equal(effectiveSuppressionReason("UNSUBSCRIBE", "PROVIDER_SUPPRESSED"), "PROVIDER_SUPPRESSED");
    assert.equal(effectiveSuppressionReason(null, "BOUNCE"), "BOUNCE");
  });

  it("isReconciled needs the same verified Resend suppression and a consistent status", () => {
    const s = { id: "sup_1", email: "user1@example.com", origin: "bounce" as const, sourceEmailId: "e", createdAt: null };
    const local = { email: "user1@example.com", reason: "BOUNCE", provider_suppression_id: "sup_1", verified_at: "2026-10-02" };
    assert.equal(isReconciled(sub(1, "BOUNCED"), local, s), true);
    assert.equal(isReconciled(sub(1, "SUBSCRIBED"), local, s), false);
    assert.equal(isReconciled(sub(1, "BOUNCED"), { ...local, verified_at: null }, s), false);
    assert.equal(isReconciled(sub(1, "BOUNCED"), { ...local, provider_suppression_id: "sup_old" }, s), false);
    assert.equal(isReconciled(sub(1, "SUPPRESSED"), { ...local, reason: "BOUNCE" }, s), false);
  });

  it("masks addresses", () => {
    assert.equal(maskEmail("someone@example.org"), "s*****e@e***.org");
    assert.equal(maskEmail("ab@d.net"), "a*@d***.net");
  });
});

describe("reconcileProviderSuppressions — classification and apply", () => {
  it("BOUNCE / COMPLAINT / PROVIDER_SUPPRESSED, non-subscribers untouched, paged list", async () => {
    const subscribers = [sub(1), sub(2), sub(3), sub(4), sub(5)];
    const { client, calls } = resend({
      pages: [
        [sup(1), sup(2, "complaint", null)],
        [sup(3, "manual", null), sup(4), sup(5)],
        [sup(99)], // a promo prospect: no subscriber row
      ],
      bounces: { email_1: PERMANENT, email_4: TRANSIENT /* email_5: no bounce field */ },
    });
    const { store, applied } = memoryStore(subscribers);

    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });

    assert.equal(summary.ok, true);
    assert.equal(summary.accountSuppressions, 6);
    assert.equal(summary.matchedSubscribers, 5);
    assert.deepEqual(summary.classified, { BOUNCE: 1, COMPLAINT: 1, PROVIDER_SUPPRESSED: 3 });
    assert.equal(summary.unverified, 1); // the missing bounce field
    assert.deepEqual(subscribers.map((s) => s.status), ["BOUNCED", "UNSUBSCRIBED", "SUPPRESSED", "SUPPRESSED", "SUPPRESSED"]);
    assert.equal(summary.updated, 5);
    assert.equal(summary.plannedContactChanges, 5);
    assert.deepEqual(summary.changedSubscriberIds, ["sub-1", "sub-2", "sub-3", "sub-4", "sub-5"]);
    assert.equal(applied.some((a) => a.email === "user99@example.com"), false);
    // Three list pages, one source lookup per bounce, nothing else.
    assert.deepEqual(calls.filter((c) => c.startsWith("suppressions.list")), ["suppressions.list#0", "suppressions.list#1", "suppressions.list#2"]);
    assert.deepEqual(calls.filter((c) => c.startsWith("emails.get")).sort(), ["emails.get:email_1", "emails.get:email_4", "emails.get:email_5"]);
    assert.equal(calls.some((c) => c.startsWith("UNEXPECTED")), false);
  });

  it("dry-run: the same plan, zero DB writes and zero Resend writes", async () => {
    const subscribers = [sub(1), sub(2)];
    const { client, calls } = resend({ pages: [[sup(1), sup(2, "complaint", null)]], bounces: { email_1: PERMANENT } });
    const { store, applied } = memoryStore(subscribers);
    const guarded: ReconcileStore = {
      ...store,
      applyProviderSuppression: async () => {
        throw new Error("dry-run must not write");
      },
    };

    const summary = await reconcileProviderSuppressions({ store: guarded, client, apply: false, ...NO_WAIT });

    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.ok, true);
    assert.equal(applied.length, 0);
    assert.deepEqual(subscribers.map((s) => s.status), ["SUBSCRIBED", "SUBSCRIBED"]);
    assert.equal(summary.plannedSubscriberChanges, 2);
    assert.equal(summary.plannedContactChanges, 2);
    assert.equal(summary.updated, 0);
    assert.deepEqual(summary.items.map((i) => [i.maskedEmail, i.newStatus]), [
      ["u***1@e***.com", "BOUNCED"],
      ["u***2@e***.com", "UNSUBSCRIBED"],
    ]);
    assert.equal(calls.every((c) => c.startsWith("suppressions.list") || c.startsWith("emails.get")), true);
  });

  it("skips matches already reconciled for the same verified suppression", async () => {
    const subscribers = [sub(1, "BOUNCED"), sub(2)];
    const locals = [{ email: "user1@example.com", reason: "BOUNCE", provider_suppression_id: "sup_1", verified_at: "2026-10-02" }];
    const { client, calls } = resend({ pages: [[sup(1), sup(2)]], bounces: { email_2: PERMANENT } });
    const { store } = memoryStore(subscribers, locals);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    assert.equal(summary.upToDate, 1);
    assert.equal(summary.checked, 1);
    assert.deepEqual(calls.filter((c) => c.startsWith("emails.get")), ["emails.get:email_2"]);
  });

  it("a stored COMPLAINT is not downgraded by a later bounce classification", async () => {
    const subscribers = [sub(1, "UNSUBSCRIBED")];
    const locals = [{ email: "user1@example.com", reason: "COMPLAINT", provider_suppression_id: null, verified_at: null }];
    const { client } = resend({ pages: [[sup(1)]], bounces: { email_1: PERMANENT } });
    const { store } = memoryStore(subscribers, locals);
    const summary = await reconcileProviderSuppressions({ store, client, apply: false, ...NO_WAIT });
    assert.equal(summary.items[0].effectiveReason, "COMPLAINT");
    assert.equal(summary.items[0].statusChange, false);
  });

  it("never re-subscribes: a subscriber whose suppression left Resend stays as it is", async () => {
    const subscribers = [sub(1, "BOUNCED")];
    const { client } = resend({ pages: [[]] });
    const { store, applied } = memoryStore(subscribers, [
      { email: "user1@example.com", reason: "BOUNCE", provider_suppression_id: "sup_1", verified_at: "2026-10-02" },
    ]);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    assert.equal(summary.matchedSubscribers, 0);
    assert.equal(applied.length, 0);
    assert.equal(subscribers[0].status, "BOUNCED");
  });
});

describe("reconcileProviderSuppressions — failures", () => {
  it("an unreadable suppression list fails the run without applying anything", async () => {
    const subscribers = [sub(1)];
    const { client } = resend({ pages: [[sup(1)], [sup(2)]], listFailsAtPage: 1 });
    const { store, applied } = memoryStore(subscribers);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    assert.equal(summary.ok, false);
    assert.match(summary.error ?? "", /internal_server_error \(500\)/);
    assert.equal(applied.length, 0);
    assert.equal(subscribers[0].status, "SUBSCRIBED");
  });

  it("a failed source lookup fails closed (PROVIDER_SUPPRESSED, unverified) and the run continues", async () => {
    const subscribers = [sub(1), sub(2)];
    const { client } = resend({ pages: [[sup(1), sup(2)]], bounces: { email_2: PERMANENT }, emailFails: new Set(["email_1"]) });
    const { store } = memoryStore(subscribers);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    assert.equal(summary.ok, true);
    assert.deepEqual(subscribers.map((s) => s.status), ["SUPPRESSED", "BOUNCED"]);
    assert.equal(summary.unverified, 1);
  });

  it("one subscriber failing to apply → partial result, ok=false, the others still applied, no address logged", async () => {
    const subscribers = [sub(1), sub(2), sub(3)];
    const { client } = resend({ pages: [[sup(1), sup(2), sup(3)]], bounces: { email_1: PERMANENT, email_2: PERMANENT, email_3: PERMANENT } });
    const { store } = memoryStore(subscribers, [], { failFor: new Set(["user2@example.com"]) });

    const logs: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
    let summary;
    try {
      summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    } finally {
      console.error = original;
    }

    assert.equal(summary.ok, false);
    assert.equal(summary.updated, 2);
    assert.equal(summary.failed, 1);
    assert.deepEqual(subscribers.map((s) => s.status), ["BOUNCED", "SUBSCRIBED", "BOUNCED"]);
    assert.equal(summary.items[1].result, "failed");
    assert.equal(logs.length, 1);
    assert.equal(logs.join(" ").includes("user2@"), false);
  });

  it("caps the lookups per run and reports the rest as deferred", async () => {
    const subscribers = [sub(1), sub(2), sub(3)];
    const { client } = resend({ pages: [[sup(1), sup(2), sup(3)]], bounces: { email_1: PERMANENT, email_2: PERMANENT, email_3: PERMANENT } });
    const { store } = memoryStore(subscribers);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, maxChecks: 2, ...NO_WAIT });
    assert.equal(summary.checked, 2);
    assert.equal(summary.deferred, 1);
    assert.equal(subscribers[2].status, "SUBSCRIBED");
  });

  it("the cron summary carries counts only — no addresses, masked or not", async () => {
    const { client } = resend({ pages: [[sup(1)]], bounces: { email_1: PERMANENT } });
    const { store } = memoryStore([sub(1)]);
    const summary = await reconcileProviderSuppressions({ store, client, apply: true, ...NO_WAIT });
    const text = JSON.stringify(summarizeReconcile(summary));
    assert.equal(text.includes("@"), false);
    assert.equal(text.includes("sub-1"), false);
  });
});

describe("runContactSyncCycle (contact-sync cron)", () => {
  function deps(overrides: Partial<ContactSyncCycleDeps> = {}) {
    const order: string[] = [];
    const d: ContactSyncCycleDeps = {
      contactSyncEnabled: () => true,
      reconcileEnabled: () => true,
      campaignSending: async () => false,
      reconcile: async () => {
        order.push("reconcile");
        return {
          mode: "apply",
          ok: true,
          error: null,
          accountSuppressions: 7,
          matchedSubscribers: 5,
          upToDate: 0,
          checked: 5,
          deferred: 0,
          classified: { BOUNCE: 5, COMPLAINT: 0, PROVIDER_SUPPRESSED: 0 },
          unverified: 0,
          plannedSubscriberChanges: 5,
          plannedContactChanges: 5,
          updated: 5,
          already: 0,
          notFound: 0,
          failed: 0,
          changedSubscriberIds: ["sub-1"],
          items: [],
        };
      },
      retryPending: async () => {
        order.push("retry");
        return { attempted: 5, succeeded: 5, failed: 0 };
      },
      ...overrides,
    };
    return { d, order };
  }

  it("reconciles first, then retries Contacts (so the moved rows are pushed in the same run)", async () => {
    const { d, order } = deps();
    const result = await runContactSyncCycle(d);
    assert.equal(result.ok, true);
    assert.deepEqual(order, ["reconcile", "retry"]);
    assert.equal(result.summary.attempted, 5);
    assert.equal("changedSubscriberIds" in result.summary.reconciliation, false);
  });

  it("stands down entirely while a campaign is SENDING", async () => {
    const { d, order } = deps({ campaignSending: async () => true });
    const result = await runContactSyncCycle(d);
    assert.deepEqual(order, []);
    assert.equal(result.summary.skipped, "campaign_sending");
    assert.deepEqual(result.summary.reconciliation, { skipped: "campaign_sending" });
  });

  it("with the reconcile flag off behaves exactly as before", async () => {
    const { d, order } = deps({ reconcileEnabled: () => false });
    const result = await runContactSyncCycle(d);
    assert.equal(result.ok, true);
    assert.deepEqual(order, ["retry"]);
    assert.deepEqual(result.summary.reconciliation, { skipped: "disabled" });
  });

  it("a failed reconciliation is reported (ok=false) but the Contact retries still run", async () => {
    const base = deps();
    const failing = deps({
      reconcile: async () => ({ ...(await base.d.reconcile()), ok: false, error: "Resend suppression 목록 조회 실패: internal_server_error (500)" }),
    });
    const original = console.error;
    console.error = () => {};
    try {
      const result = await runContactSyncCycle(failing.d);
      assert.equal(result.ok, false);
      assert.deepEqual(failing.order, ["retry"]);
    } finally {
      console.error = original;
    }
  });

  it("does nothing when Contact sync is disabled", async () => {
    const { d, order } = deps({ contactSyncEnabled: () => false });
    const result = await runContactSyncCycle(d);
    assert.deepEqual(order, []);
    assert.equal(result.summary.skipped, "disabled");
  });
});
