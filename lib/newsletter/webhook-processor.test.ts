import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { WebhookEventPayload } from "resend";
import { processResendWebhook, type SuppressionReason, type WebhookStore } from "./webhook-processor";
import { verifyResendWebhook } from "./resend-webhooks";

// ---------------------------------------------------------------------------
// In-memory stand-in for the Supabase tables: unique svix_id, FAILED rows
// re-claimable, and applySubscriberChange following the same rules as the
// SQL function newsletter_apply_resend_opt_out (tested for real against
// Postgres in subscription-sql.test.ts).
// ---------------------------------------------------------------------------

type EventRow = {
  id: string;
  svixId: string;
  eventType: string;
  status: string;
  attempts: number;
  outcome?: string;
  emailId?: string | null;
  broadcastSendId?: string | null;
  subscriberId?: string | null;
  metadata?: Record<string, string>;
  error?: string;
};

type Subscriber = { id: string; email: string; status: string; subscribed_at: string; unsubscribed_at: string | null };

const RANK: Record<SuppressionReason, number> = { UNSUBSCRIBE: 0, BOUNCE: 1, COMPLAINT: 2 };
const REASON = { resend_unsubscribe: "UNSUBSCRIBE", complaint: "COMPLAINT", permanent_bounce: "BOUNCE" } as const;

function memoryDb(options: { subscribers?: Subscriber[]; broadcasts?: Record<string, string> } = {}) {
  const events: EventRow[] = [];
  const subscribers = options.subscribers ?? [];
  const broadcasts = options.broadcasts ?? {};
  const suppressions = new Map<string, SuppressionReason>();
  const failures = { claim: false, applySubscriberChange: 0, complete: 0 };

  const store: WebhookStore = {
    async claim({ svixId, eventType }) {
      if (failures.claim) throw new Error("connection refused");
      const existing = events.find((e) => e.svixId === svixId);
      if (!existing) {
        const row: EventRow = { id: `ev_${events.length + 1}`, svixId, eventType, status: "PROCESSING", attempts: 1 };
        events.push(row);
        return { state: "claimed", eventId: row.id };
      }
      if (existing.status === "PROCESSED" || existing.status === "IGNORED") return { state: "done", status: existing.status };
      if (existing.status === "FAILED") {
        existing.status = "PROCESSING";
        existing.attempts++;
        return { state: "claimed", eventId: existing.id };
      }
      return { state: "in_progress" };
    },
    async findBroadcastSend(id) {
      return broadcasts[id] ?? null;
    },
    async applySubscriberChange(change, context) {
      if (failures.applySubscriberChange > 0) {
        failures.applySubscriberChange--;
        throw new Error(`update failed for ${change.email}`);
      }
      const reason = REASON[change.reason];
      const suppress = () => {
        const current = suppressions.get(change.email);
        if (current === undefined || RANK[reason] > RANK[current]) suppressions.set(change.email, reason);
      };
      const row = subscribers.find((s) => s.email === change.email);
      if (!row) {
        if (reason !== "UNSUBSCRIBE") suppress();
        return { outcome: "not_found", subscriberId: null };
      }
      if (row.status !== "SUBSCRIBED") {
        suppress();
        return { outcome: "already", subscriberId: row.id };
      }
      if (reason === "UNSUBSCRIBE" && context.eventAt && new Date(context.eventAt) < new Date(row.subscribed_at)) {
        return { outcome: "stale", subscriberId: row.id };
      }
      row.status = change.status;
      if (change.status === "UNSUBSCRIBED") row.unsubscribed_at = "now";
      suppress();
      return { outcome: "updated", subscriberId: row.id };
    },
    async complete(eventId, input) {
      if (failures.complete > 0) {
        failures.complete--;
        throw new Error("write timeout");
      }
      const row = events.find((e) => e.id === eventId)!;
      Object.assign(row, {
        status: input.status,
        outcome: input.outcome,
        emailId: input.emailId,
        broadcastSendId: input.broadcastSendId,
        subscriberId: input.subscriberId,
        metadata: input.metadata,
      });
    },
    async fail(eventId, error) {
      const row = events.find((e) => e.id === eventId)!;
      row.status = "FAILED";
      row.error = error;
    },
  };

  // Mirrors the newsletter_broadcast_stats view.
  function stats(broadcastSendId: string) {
    const rows = events.filter((e) => e.broadcastSendId === broadcastSendId && e.status === "PROCESSED");
    const of = (type: string) => rows.filter((e) => e.eventType === type);
    const unique = (type: string) => new Set(of(type).map((e) => e.emailId)).size;
    return {
      delivered: unique("email.delivered"),
      uniqueOpens: unique("email.opened"),
      totalOpens: of("email.opened").length,
      uniqueClicks: unique("email.clicked"),
      totalClicks: of("email.clicked").length,
      bounced: unique("email.bounced"),
      complained: unique("email.complained"),
    };
  }

  return { store, events, subscribers, suppressions, failures, stats };
}

function subscriber(email: string, overrides: Partial<Subscriber> = {}): Subscriber {
  return {
    id: `sub_${email.split("@")[0]}`,
    email,
    status: "SUBSCRIBED",
    subscribed_at: "2026-09-01T00:00:00Z",
    unsubscribed_at: null,
    ...overrides,
  };
}

const BROADCAST = "b_live";
const SEND_ROW = "send_row_1";

function emailEvent(type: string, extra: Record<string, unknown> = {}, emailId = "e_1", to = "kim@example.com") {
  return {
    type,
    created_at: "2026-10-01T00:00:00Z",
    data: { broadcast_id: BROADCAST, email_id: emailId, created_at: "", from: "news@news.moz9.kr", subject: "s", to: [to], ...extra },
  } as unknown as WebhookEventPayload;
}

function contactEvent(email: string, unsubscribed: boolean, createdAt = "2026-10-01T00:00:00Z") {
  return { type: "contact.updated", created_at: createdAt, data: { id: "c_1", email, unsubscribed } } as unknown as WebhookEventPayload;
}

let seq = 0;
const nextId = () => `msg_${++seq}`;

function run(db: ReturnType<typeof memoryDb>, event: WebhookEventPayload, webhookId = nextId()) {
  return processResendWebhook({ webhookId, event }, { store: db.store });
}

function quietly<T>(fn: () => Promise<T>): Promise<{ result: T; logs: string[] }> {
  const logs: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  return fn()
    .then((result) => ({ result, logs }))
    .finally(() => {
      console.error = original;
    });
}

// ---------------------------------------------------------------------------

describe("webhook: signature + processing (integration)", () => {
  const SECRET = `whsec_${Buffer.from("integration-secret-0123456789").toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from(SECRET.slice(6), "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;

  it("a validly signed event is verified and processed", async () => {
    const db = memoryDb({ broadcasts: { [BROADCAST]: SEND_ROW } });
    const body = JSON.stringify(emailEvent("email.delivered"));
    const ts = String(Math.floor(Date.now() / 1000));
    const verified = verifyResendWebhook(
      body,
      new Headers({ "svix-id": "msg_signed", "svix-timestamp": ts, "svix-signature": sign("msg_signed", ts, body) }),
      SECRET,
    );
    assert.ok(verified.ok);
    if (!verified.ok) return;
    const result = await processResendWebhook({ webhookId: verified.webhookId, event: verified.event }, { store: db.store });
    assert.equal(result.httpStatus, 200);
    assert.equal(db.stats(SEND_ROW).delivered, 1);
  });

  it("an invalid signature never reaches the processor", () => {
    const body = JSON.stringify(emailEvent("email.delivered"));
    const ts = String(Math.floor(Date.now() / 1000));
    const verified = verifyResendWebhook(
      body,
      new Headers({ "svix-id": "msg_bad", "svix-timestamp": ts, "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }),
      SECRET,
    );
    assert.deepEqual(verified, { ok: false, status: 401, error: "invalid signature" });
  });
});

describe("webhook: idempotency", () => {
  it("a redelivered event (same svix-id) is acknowledged without re-applying", async () => {
    const db = memoryDb({ broadcasts: { [BROADCAST]: SEND_ROW } });
    const first = await run(db, emailEvent("email.opened"), "msg_dup");
    const again = await run(db, emailEvent("email.opened"), "msg_dup");
    assert.equal(first.result, "processed");
    assert.deepEqual(again, { httpStatus: 200, result: "duplicate" });
    assert.equal(db.events.length, 1);
    assert.equal(db.stats(SEND_ROW).totalOpens, 1);
  });

  it("an event being processed concurrently answers 409 so Resend retries", async () => {
    const db = memoryDb();
    db.events.push({ id: "ev_x", svixId: "msg_busy", eventType: "email.opened", status: "PROCESSING", attempts: 1 });
    assert.deepEqual(await run(db, emailEvent("email.opened"), "msg_busy"), { httpStatus: 409, result: "in_progress" });
  });
});

describe("webhook: Resend-side unsubscribe", () => {
  it("unsubscribes the subscriber and suppresses the address", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com")] });
    const result = await run(db, contactEvent("Lee@Example.com", true));
    assert.equal(result.outcome, "subscriber_updated");
    assert.equal(db.subscribers[0].status, "UNSUBSCRIBED");
    assert.equal(db.subscribers[0].unsubscribed_at, "now");
    assert.equal(db.suppressions.get("lee@example.com"), "UNSUBSCRIBE");
    assert.equal(db.events[0].subscriberId, "sub_lee");
    assert.equal(result.resyncSubscriberId, undefined);
  });

  it("a second unsubscribe event is idempotent", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com")] });
    await run(db, contactEvent("lee@example.com", true));
    const second = await run(db, contactEvent("lee@example.com", true));
    assert.equal(second.httpStatus, 200);
    assert.equal(second.outcome, "subscriber_already");
    assert.equal(db.subscribers[0].status, "UNSUBSCRIBED");
    assert.equal(db.suppressions.size, 1);
  });

  it("records but changes nothing when the subscriber isn't found", async () => {
    const db = memoryDb();
    const result = await run(db, contactEvent("ghost@example.com", true));
    assert.deepEqual(result, { httpStatus: 200, result: "processed", outcome: "subscriber_not_found" });
    assert.equal(db.suppressions.size, 0);
  });

  it("ignores an unsubscribe older than the subscriber's latest re-subscribe", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com", { subscribed_at: "2026-10-02T00:00:00Z" })] });
    const result = await run(db, contactEvent("lee@example.com", true, "2026-10-01T00:00:00Z"));
    assert.equal(result.outcome, "subscriber_stale");
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");
    assert.equal(db.suppressions.size, 0);
  });

  it("ignores contact updates that keep the contact subscribed", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com")] });
    const result = await run(db, contactEvent("lee@example.com", false));
    assert.equal(result.result, "ignored");
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");
  });
});

describe("webhook: complaints and bounces on a 검레터 Broadcast", () => {
  it("a complaint unsubscribes, suppresses with COMPLAINT and asks for a Contact resync", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")], broadcasts: { [BROADCAST]: SEND_ROW } });
    const result = await run(db, emailEvent("email.complained"));
    assert.equal(result.outcome, "broadcast_stat+subscriber_updated");
    assert.equal(result.resyncSubscriberId, "sub_kim");
    assert.equal(db.subscribers[0].status, "UNSUBSCRIBED");
    assert.equal(db.suppressions.get("kim@example.com"), "COMPLAINT");
    assert.equal(db.stats(SEND_ROW).complained, 1);
  });

  it("a complaint upgrades an existing UNSUBSCRIBE suppression", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")], broadcasts: { [BROADCAST]: SEND_ROW } });
    await run(db, contactEvent("kim@example.com", true));
    await run(db, emailEvent("email.complained"));
    assert.equal(db.suppressions.get("kim@example.com"), "COMPLAINT");
  });

  it("a complaint still suppresses when the subscriber row is gone", async () => {
    const db = memoryDb({ broadcasts: { [BROADCAST]: SEND_ROW } });
    const result = await run(db, emailEvent("email.complained"));
    assert.equal(result.outcome, "broadcast_stat+subscriber_not_found");
    assert.equal(db.suppressions.get("kim@example.com"), "COMPLAINT");
  });

  it("a permanent bounce marks BOUNCED and suppresses with BOUNCE", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")], broadcasts: { [BROADCAST]: SEND_ROW } });
    await run(db, emailEvent("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "" } }));
    assert.equal(db.subscribers[0].status, "BOUNCED");
    assert.equal(db.subscribers[0].unsubscribed_at, null);
    assert.equal(db.suppressions.get("kim@example.com"), "BOUNCE");
    assert.equal(db.events[0].metadata?.bounce_type, "Permanent");
    assert.equal(db.stats(SEND_ROW).bounced, 1);
  });

  it("a temporary bounce is counted but changes no subscriber", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")], broadcasts: { [BROADCAST]: SEND_ROW } });
    const result = await run(db, emailEvent("email.bounced", { bounce: { type: "Transient", subType: "MailboxFull", message: "" } }));
    assert.equal(result.outcome, "broadcast_stat");
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");
    assert.equal(db.suppressions.size, 0);
    assert.equal(db.stats(SEND_ROW).bounced, 1);
  });

  it("a bounce does not overwrite an already UNSUBSCRIBED status", async () => {
    const db = memoryDb({
      subscribers: [subscriber("kim@example.com", { status: "UNSUBSCRIBED" })],
      broadcasts: { [BROADCAST]: SEND_ROW },
    });
    await run(db, emailEvent("email.bounced", { bounce: { type: "Permanent", subType: "General", message: "" } }));
    assert.equal(db.subscribers[0].status, "UNSUBSCRIBED");
    assert.equal(db.suppressions.get("kim@example.com"), "BOUNCE");
  });
});

describe("webhook: Broadcast stats", () => {
  it("counts delivered, unique vs repeated opens and clicks", async () => {
    const db = memoryDb({ broadcasts: { [BROADCAST]: SEND_ROW } });
    await run(db, emailEvent("email.delivered", {}, "e_1"));
    await run(db, emailEvent("email.delivered", {}, "e_2", "lee@example.com"));
    await run(db, emailEvent("email.opened", {}, "e_1"));
    await run(db, emailEvent("email.opened", {}, "e_1")); // repeated open, new svix-id
    await run(db, emailEvent("email.opened", {}, "e_2", "lee@example.com"));
    const click = { click: { link: "https://moz9.kr/p?utm=x", ipAddress: "1.1.1.1", timestamp: "", userAgent: "UA" } };
    await run(db, emailEvent("email.clicked", click, "e_1"));
    await run(db, emailEvent("email.clicked", click, "e_1")); // repeated click

    assert.deepEqual(db.stats(SEND_ROW), {
      delivered: 2,
      uniqueOpens: 2,
      totalOpens: 3,
      uniqueClicks: 1,
      totalClicks: 2,
      bounced: 0,
      complained: 0,
    });
    const clickRow = db.events.find((e) => e.eventType === "email.clicked")!;
    assert.deepEqual(clickRow.metadata, { link: "https://moz9.kr/p" });
  });

  it("stores no email address on event rows", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")], broadcasts: { [BROADCAST]: SEND_ROW } });
    await run(db, emailEvent("email.complained"));
    await run(db, contactEvent("kim@example.com", true));
    assert.equal(JSON.stringify(db.events).includes("@"), false);
  });
});

describe("webhook: events that aren't ours", () => {
  it("ignores unknown event types", async () => {
    const db = memoryDb();
    const result = await run(db, { type: "domain.updated", created_at: "", data: {} } as unknown as WebhookEventPayload);
    assert.deepEqual(result, { httpStatus: 200, result: "ignored", outcome: "unsupported_type" });
    assert.equal(db.events[0].status, "IGNORED");
  });

  it("ignores transactional / legacy email events (no broadcast id) without touching subscribers", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")] });
    const event = {
      type: "email.complained",
      created_at: "",
      data: { email_id: "e_tx", created_at: "", from: "news@news.moz9.kr", subject: "주문 확인", to: ["kim@example.com"] },
    } as unknown as WebhookEventPayload;
    const result = await run(db, event);
    assert.deepEqual(result, { httpStatus: 200, result: "ignored", outcome: "not_newsletter" });
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");
    assert.equal(db.suppressions.size, 0);
    assert.equal(db.events[0].emailId, null);
  });

  it("ignores events of a Broadcast that isn't a 검레터 run (e.g. a manual test)", async () => {
    const db = memoryDb({ subscribers: [subscriber("kim@example.com")] });
    const result = await run(db, emailEvent("email.complained"));
    assert.equal(result.outcome, "broadcast_not_linked");
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");
    assert.equal(db.suppressions.size, 0);
  });
});

describe("webhook: failures and retry", () => {
  it("returns 500 when the event can't even be recorded", async () => {
    const db = memoryDb();
    db.failures.claim = true;
    const { result } = await quietly(() => run(db, contactEvent("lee@example.com", true)));
    assert.deepEqual(result, { httpStatus: 500, result: "failed" });
  });

  it("a DB failure marks the event FAILED (500) and Resend's retry applies it exactly once", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com")] });
    db.failures.applySubscriberChange = 1;
    const { result: first } = await quietly(() => run(db, contactEvent("lee@example.com", true), "msg_retry"));
    assert.deepEqual(first, { httpStatus: 500, result: "failed" });
    assert.equal(db.events[0].status, "FAILED");
    assert.equal(db.subscribers[0].status, "SUBSCRIBED");

    const retry = await run(db, contactEvent("lee@example.com", true), "msg_retry");
    assert.equal(retry.httpStatus, 200);
    assert.equal(db.events.length, 1);
    assert.equal(db.events[0].attempts, 2);
    assert.equal(db.subscribers[0].status, "UNSUBSCRIBED");

    const third = await run(db, contactEvent("lee@example.com", true), "msg_retry");
    assert.equal(third.result, "duplicate");
  });

  it("a failure after the effect was applied doesn't double-count on retry", async () => {
    const db = memoryDb({ broadcasts: { [BROADCAST]: SEND_ROW } });
    db.failures.complete = 1;
    const { result: first } = await quietly(() => run(db, emailEvent("email.opened"), "msg_half"));
    assert.equal(first.httpStatus, 500);
    assert.equal(db.stats(SEND_ROW).totalOpens, 0);

    await run(db, emailEvent("email.opened"), "msg_half");
    assert.equal(db.stats(SEND_ROW).totalOpens, 1);
  });

  it("redacts email addresses from failure logs and stored errors", async () => {
    const db = memoryDb({ subscribers: [subscriber("lee@example.com")] });
    db.failures.applySubscriberChange = 1;
    const { logs } = await quietly(() => run(db, contactEvent("lee@example.com", true)));
    assert.ok(logs.length > 0);
    assert.equal(logs.some((line) => line.includes("lee@example.com")), false);
    assert.equal(db.events[0].error?.includes("lee@example.com"), false);
    assert.ok(db.events[0].error?.includes("<email>"));
  });
});
