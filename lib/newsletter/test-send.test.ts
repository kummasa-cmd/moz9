import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_TEST_RECIPIENTS,
  TEST_UNSUBSCRIBE_HREF,
  buildTestSendPayloads,
  normalizeTestEmail,
  sendNewsletterTest,
  type TestSendPayload,
} from "./test-send";
import { RESEND_UNSUBSCRIBE_PLACEHOLDER } from "./resend-broadcasts";

const FROM = "모즈나인 뉴스레터 <news@news.example>";
const HTML = `<p>본문</p><a href="https://moz9.kr/newsletter">지난호</a><a href="${RESEND_UNSUBSCRIBE_PLACEHOLDER}">수신거부</a>`;

describe("normalizeTestEmail", () => {
  it("trims and lowercases a valid address", () => assert.equal(normalizeTestEmail("  Tester@Example.COM "), "tester@example.com"));
  it("rejects malformed input", () => {
    for (const bad of ["", "tester", "tester@", "@example.com", "a b@example.com", "tester@example"]) assert.equal(normalizeTestEmail(bad), null, bad);
  });
});

describe("buildTestSendPayloads", () => {
  it("one payload per active, valid, distinct address; inactive ones skipped", () => {
    const plan = buildTestSendPayloads({
      recipients: [
        { email: "a@example.com", active: true },
        { email: "A@Example.com", active: true }, // duplicate
        { email: "b@example.com", active: false },
        { email: "not-an-email", active: true },
        { email: "c@example.com", active: true },
      ],
      from: FROM,
      subject: "제11호",
      html: HTML,
    });
    assert.equal(plan.ok, true);
    assert.deepEqual(plan.ok && plan.payloads.map((p) => p.to), ["a@example.com", "c@example.com"]);
  });

  it("subject gets [테스트] once; from is the newsletter sender", () => {
    const plan = buildTestSendPayloads({ recipients: [{ email: "a@example.com", active: true }], from: FROM, subject: "제11호", html: HTML });
    assert.ok(plan.ok);
    assert.equal(plan.payloads[0].subject, "[테스트] 제11호");
    assert.equal(plan.payloads[0].from, FROM);
    const again = buildTestSendPayloads({ recipients: [{ email: "a@example.com", active: true }], from: FROM, subject: "[테스트] 제11호", html: HTML });
    assert.equal(again.ok && again.payloads[0].subject, "[테스트] 제11호");
  });

  it("the Resend unsubscribe placeholder (Broadcast-only) becomes a harmless anchor; the rest is unchanged", () => {
    const plan = buildTestSendPayloads({ recipients: [{ email: "a@example.com", active: true }], from: FROM, subject: "s", html: HTML });
    assert.ok(plan.ok);
    const html = plan.payloads[0].html;
    assert.equal(html.includes(RESEND_UNSUBSCRIBE_PLACEHOLDER), false);
    assert.equal(html.split(TEST_UNSUBSCRIBE_HREF).length - 1, 1);
    assert.ok(html.includes('href="https://moz9.kr/newsletter"'));
    assert.equal(html.includes("/api/track"), false);
  });

  it("no active recipient → error, nothing to send", () => {
    const plan = buildTestSendPayloads({ recipients: [{ email: "a@example.com", active: false }], from: FROM, subject: "s", html: HTML });
    assert.equal(plan.ok, false);
    assert.match(plan.ok ? "" : plan.error, /활성 테스트 계정이 없습니다/);
  });

  it(`more than ${MAX_TEST_RECIPIENTS} active → refused`, () => {
    const recipients = Array.from({ length: MAX_TEST_RECIPIENTS + 1 }, (_, i) => ({ email: `t${i}@example.com`, active: true }));
    assert.equal(buildTestSendPayloads({ recipients, from: FROM, subject: "s", html: HTML }).ok, false);
    assert.equal(buildTestSendPayloads({ recipients: recipients.slice(0, MAX_TEST_RECIPIENTS), from: FROM, subject: "s", html: HTML }).ok, true);
  });
});

describe("sendNewsletterTest", () => {
  const deps = (over: { send?: (p: TestSendPayload[]) => Promise<{ error: { message: string } | null }>; recipients?: { email: string; active: boolean }[] } = {}) => {
    const sent: TestSendPayload[][] = [];
    return {
      sent,
      deps: {
        loadRecipients: async () => over.recipients ?? [{ email: "a@example.com", active: true }, { email: "b@example.com", active: true }],
        renderHtml: async () => HTML,
        sendBatch: over.send ?? (async (p: TestSendPayload[]) => (sent.push(p), { error: null })),
      },
    };
  };

  it("sends one batch to the active list and reports the count", async () => {
    const d = deps();
    const result = await sendNewsletterTest({ from: FROM, subject: "제11호" }, d.deps);
    assert.deepEqual(result, { ok: true, sent: 2 });
    assert.equal(d.sent.length, 1);
    assert.deepEqual(d.sent[0].map((p) => p.to), ["a@example.com", "b@example.com"]);
  });

  it("a provider error is reported, not thrown", async () => {
    const d = deps({ send: async () => ({ error: { message: "daily quota" } }) });
    const result = await sendNewsletterTest({ from: FROM, subject: "s" }, d.deps);
    assert.deepEqual(result, { ok: false, error: "테스트 발송 실패: daily quota" });
  });

  it("an exception (e.g. list unreadable) is reported, not thrown", async () => {
    const result = await sendNewsletterTest(
      { from: FROM, subject: "s" },
      { loadRecipients: async () => Promise.reject(new Error("relation does not exist")), renderHtml: async () => HTML, sendBatch: async () => ({ error: null }) },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok ? "" : result.error, /relation does not exist/);
  });

  it("an empty list sends nothing", async () => {
    const d = deps({ recipients: [] });
    const result = await sendNewsletterTest({ from: FROM, subject: "s" }, d.deps);
    assert.equal(result.ok, false);
    assert.equal(d.sent.length, 0);
  });
});
