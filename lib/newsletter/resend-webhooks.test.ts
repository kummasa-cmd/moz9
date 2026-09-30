import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { WebhookEventPayload } from "resend";
import {
  describeWebhookPlan,
  planResendWebhookEvent,
  sanitizeLink,
  verifyResendWebhook,
  type WebhookVerifier,
} from "./resend-webhooks";

// Signs a payload the way Svix / standardwebhooks does:
// base64(HMAC-SHA256(base64decode(secret), `${id}.${timestamp}.${body}`)).
const SECRET = `whsec_${Buffer.from("test-secret-key-0123456789").toString("base64")}`;
function sign(id: string, timestamp: string, body: string, secret = SECRET): string {
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}

function headers(values: Record<string, string>) {
  return new Headers(values);
}

const body = JSON.stringify({
  type: "email.delivered",
  created_at: "2026-09-30T00:00:00.000Z",
  data: { broadcast_id: "b_1", email_id: "e_1", created_at: "", from: "x", to: ["kim@example.com"], subject: "s" },
});

describe("verifyResendWebhook (real SDK verifier)", () => {
  const now = String(Math.floor(Date.now() / 1000));

  it("accepts a correctly signed payload", () => {
    const result = verifyResendWebhook(
      body,
      headers({ "svix-id": "msg_1", "svix-timestamp": now, "svix-signature": sign("msg_1", now, body) }),
      SECRET,
    );
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.webhookId, "msg_1");
      assert.equal(result.event.type, "email.delivered");
    }
  });

  it("rejects a tampered body", () => {
    const result = verifyResendWebhook(
      body.replace("b_1", "b_2"),
      headers({ "svix-id": "msg_1", "svix-timestamp": now, "svix-signature": sign("msg_1", now, body) }),
      SECRET,
    );
    assert.deepEqual(result, { ok: false, status: 401, error: "invalid signature" });
  });

  it("rejects a signature made with another secret", () => {
    const other = `whsec_${Buffer.from("another-secret-key-000000").toString("base64")}`;
    const result = verifyResendWebhook(
      body,
      headers({ "svix-id": "msg_1", "svix-timestamp": now, "svix-signature": sign("msg_1", now, body, other) }),
      SECRET,
    );
    assert.equal(result.ok, false);
  });

  it("rejects replayed (old) timestamps", () => {
    const old = String(Math.floor(Date.now() / 1000) - 60 * 60);
    const result = verifyResendWebhook(
      body,
      headers({ "svix-id": "msg_1", "svix-timestamp": old, "svix-signature": sign("msg_1", old, body) }),
      SECRET,
    );
    assert.equal(result.ok, false);
  });

  it("returns 400 when signature headers are missing", () => {
    assert.deepEqual(verifyResendWebhook(body, headers({ "svix-id": "msg_1" }), SECRET), {
      ok: false,
      status: 400,
      error: "missing signature headers",
    });
  });

  it("returns 503 when no secret is configured, without verifying", () => {
    let called = false;
    const verifier: WebhookVerifier = () => {
      called = true;
      throw new Error("unreachable");
    };
    const result = verifyResendWebhook(body, headers({}), undefined, verifier);
    assert.deepEqual(result, { ok: false, status: 503, error: "webhook not configured" });
    assert.equal(called, false);
  });
});

function event(value: unknown): WebhookEventPayload {
  return value as WebhookEventPayload;
}

const baseData = { email_id: "e_1", created_at: "", from: "news@news.moz9.kr", subject: "s", to: ["Kim@Example.com"] };

describe("planResendWebhookEvent", () => {
  it("plans broadcast email events for linking", () => {
    const plan = planResendWebhookEvent(
      event({ type: "email.opened", created_at: "2026-10-01T00:00:00Z", data: { ...baseData, broadcast_id: "b_1" } }),
    );
    assert.equal(plan.kind, "broadcast_email");
    if (plan.kind === "broadcast_email") {
      assert.equal(plan.broadcastId, "b_1");
      assert.equal(plan.emailId, "e_1");
      assert.equal(plan.change, null);
    }
    assert.equal(plan.eventCreatedAt, "2026-10-01T00:00:00Z");
  });

  it("keeps only origin + path of clicked links", () => {
    const plan = planResendWebhookEvent(
      event({
        type: "email.clicked",
        created_at: "",
        data: {
          ...baseData,
          broadcast_id: "b_1",
          click: { link: "https://moz9.kr/post/1?token=secret#x", ipAddress: "1.2.3.4", timestamp: "", userAgent: "UA" },
        },
      }),
    );
    assert.deepEqual(plan.metadata, { link: "https://moz9.kr/post/1" });
  });

  it("ignores email events without a broadcast id (legacy newsletter or service mail)", () => {
    const plan = planResendWebhookEvent(event({ type: "email.complained", created_at: "", data: baseData }));
    assert.deepEqual(plan, { eventType: "email.complained", eventCreatedAt: "", metadata: {}, kind: "ignore", reason: "not_newsletter" });
  });

  it("plans a permanent bounce as BOUNCED and records the bounce type", () => {
    const plan = planResendWebhookEvent(
      event({ type: "email.bounced", created_at: "", data: { ...baseData, broadcast_id: "b_1", bounce: { type: "Permanent", subType: "General", message: "m" } } }),
    );
    assert.equal(plan.kind, "broadcast_email");
    if (plan.kind === "broadcast_email") {
      assert.deepEqual(plan.change, { status: "BOUNCED", reason: "permanent_bounce", email: "kim@example.com" });
    }
    assert.deepEqual(plan.metadata, { bounce_type: "Permanent", bounce_sub_type: "General" });
  });

  it("does not suppress transient or undetermined bounces", () => {
    for (const type of ["Transient", "Undetermined", ""]) {
      const plan = planResendWebhookEvent(
        event({ type: "email.bounced", created_at: "", data: { ...baseData, broadcast_id: "b_1", bounce: { type, subType: "MailboxFull", message: "" } } }),
      );
      assert.equal(plan.kind === "broadcast_email" ? plan.change : "x", null, type);
    }
  });

  it("plans a complaint as UNSUBSCRIBED", () => {
    const plan = planResendWebhookEvent(event({ type: "email.complained", created_at: "", data: { ...baseData, broadcast_id: "b_1" } }));
    assert.equal(plan.kind, "broadcast_email");
    if (plan.kind === "broadcast_email") {
      assert.deepEqual(plan.change, { status: "UNSUBSCRIBED", reason: "complaint", email: "kim@example.com" });
    }
  });

  it("plans a Resend-side unsubscribe from contact.updated", () => {
    const plan = planResendWebhookEvent(
      event({ type: "contact.updated", created_at: "", data: { id: "c_1", email: "Lee@Example.com", unsubscribed: true } }),
    );
    assert.equal(plan.kind, "contact_unsubscribed");
    if (plan.kind === "contact_unsubscribed") {
      assert.deepEqual(plan.change, { status: "UNSUBSCRIBED", reason: "resend_unsubscribe", email: "lee@example.com" });
      assert.equal(plan.contactId, "c_1");
    }
    assert.deepEqual(plan.metadata, { contact_id: "c_1" });
  });

  it("ignores contact updates that keep the contact subscribed", () => {
    const plan = planResendWebhookEvent(
      event({ type: "contact.updated", created_at: "", data: { id: "c_1", email: "lee@example.com", unsubscribed: false } }),
    );
    assert.equal(plan.kind, "ignore");
  });

  it("ignores unknown event types", () => {
    for (const type of ["domain.updated", "contact.deleted", "email.received", "something.new"]) {
      const plan = planResendWebhookEvent(event({ type, created_at: "", data: {} }));
      assert.equal(plan.kind, "ignore", type);
    }
  });

  it("ignores broadcast events without an email id", () => {
    const plan = planResendWebhookEvent(event({ type: "email.delivered", created_at: "", data: { broadcast_id: "b_1", to: [] } }));
    assert.equal(plan.kind, "ignore");
  });
});

describe("sanitizeLink", () => {
  it("drops query, hash and non-http links", () => {
    assert.equal(sanitizeLink("https://moz9.kr/a/b?x=1"), "https://moz9.kr/a/b");
    assert.equal(sanitizeLink("mailto:kim@example.com"), null);
    assert.equal(sanitizeLink("not a url"), null);
    assert.equal(sanitizeLink(undefined), null);
  });
});

describe("describeWebhookPlan", () => {
  it("never includes email addresses or links", () => {
    const plan = planResendWebhookEvent(event({ type: "email.complained", created_at: "", data: { ...baseData, broadcast_id: "b_1" } }));
    const text = describeWebhookPlan(plan);
    assert.equal(text, "email.complained broadcast_email broadcast=b_1 subscriber→UNSUBSCRIBED(complaint)");
    assert.equal(/@/.test(text), false);
  });
});
