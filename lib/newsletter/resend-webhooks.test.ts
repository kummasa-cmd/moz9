import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { WebhookEventPayload } from "resend";
import {
  classifyResendWebhookEvent,
  describeWebhookAction,
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

describe("classifyResendWebhookEvent", () => {
  it("maps broadcast email events to the broadcast", () => {
    const action = classifyResendWebhookEvent(event({ type: "email.opened", created_at: "", data: { ...baseData, broadcast_id: "b_1" } }));
    assert.deepEqual(action.broadcast, { broadcastId: "b_1", event: "opened", emailId: "e_1" });
    assert.equal(action.subscriber, null);
  });

  it("keeps the clicked link", () => {
    const action = classifyResendWebhookEvent(
      event({
        type: "email.clicked",
        created_at: "",
        data: { ...baseData, broadcast_id: "b_1", click: { link: "https://moz9.kr/x", ipAddress: "", timestamp: "", userAgent: "" } },
      }),
    );
    assert.equal(action.broadcast?.link, "https://moz9.kr/x");
  });

  it("ignores broadcast stats for non-broadcast (legacy/transactional) email events", () => {
    const action = classifyResendWebhookEvent(event({ type: "email.delivered", created_at: "", data: baseData }));
    assert.equal(action.broadcast, null);
    assert.equal(action.subscriber, null);
  });

  it("marks permanent bounces as BOUNCED", () => {
    const action = classifyResendWebhookEvent(
      event({ type: "email.bounced", created_at: "", data: { ...baseData, broadcast_id: "b_1", bounce: { type: "Permanent", subType: "General", message: "" } } }),
    );
    assert.deepEqual(action.subscriber, { status: "BOUNCED", reason: "permanent_bounce", email: "kim@example.com" });
  });

  it("does not change subscribers for transient bounces", () => {
    const action = classifyResendWebhookEvent(
      event({ type: "email.bounced", created_at: "", data: { ...baseData, bounce: { type: "Transient", subType: "MailboxFull", message: "" } } }),
    );
    assert.equal(action.subscriber, null);
  });

  it("unsubscribes on spam complaints", () => {
    const action = classifyResendWebhookEvent(event({ type: "email.complained", created_at: "", data: baseData }));
    assert.deepEqual(action.subscriber, { status: "UNSUBSCRIBED", reason: "complaint", email: "kim@example.com" });
  });

  it("mirrors a Resend-side unsubscribe from contact.updated", () => {
    const action = classifyResendWebhookEvent(
      event({ type: "contact.updated", created_at: "", data: { id: "c_1", email: "Lee@Example.com", unsubscribed: true } }),
    );
    assert.deepEqual(action.subscriber, { status: "UNSUBSCRIBED", reason: "resend_unsubscribe", email: "lee@example.com" });
  });

  it("ignores contact updates that keep the contact subscribed", () => {
    const action = classifyResendWebhookEvent(
      event({ type: "contact.updated", created_at: "", data: { id: "c_1", email: "lee@example.com", unsubscribed: false } }),
    );
    assert.equal(action.subscriber, null);
  });

  it("ignores unrelated events", () => {
    const action = classifyResendWebhookEvent(event({ type: "domain.updated", created_at: "", data: {} }));
    assert.deepEqual(action, { type: "domain.updated", broadcast: null, subscriber: null });
  });
});

describe("describeWebhookAction", () => {
  it("never includes email addresses", () => {
    const action = classifyResendWebhookEvent(event({ type: "email.complained", created_at: "", data: { ...baseData, broadcast_id: "b_1" } }));
    const text = describeWebhookAction(action);
    assert.equal(text, "email.complained broadcast=b_1 event=complained subscriber→UNSUBSCRIBED(complaint)");
    assert.equal(/@/.test(text), false);
  });
});
