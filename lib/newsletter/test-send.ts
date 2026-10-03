import { RESEND_UNSUBSCRIBE_PLACEHOLDER } from "./resend-broadcasts";

// Test sends (newsletter_test_recipients, migration 0032).
//
// The editor's "테스트 계정" target sends the saved newsletter to the active
// test recipients right away, as plain transactional emails. On purpose it:
//   - never creates or changes a campaign, so the campaign lock, issue number
//     and analytics are untouched and it can be repeated any number of times;
//   - never touches newsletter_subscribers or the Resend Contacts / Segments
//     (a test address can also be a real subscriber);
//   - renders the same HTML as the Broadcast path (renderBroadcastHtml: no
//     open pixel, no click wrapping). Resend fills {{{RESEND_UNSUBSCRIBE_URL}}}
//     only in a Broadcast, so here that one link is pointed at a harmless
//     anchor — clicking it in a test mail unsubscribes nobody.
//
// Kept free of Next.js / DB imports; the rules are unit-tested.

// A test list is a handful of people; more than this is refused rather than
// sent (and the Resend batch call is limited to 100 anyway).
export const MAX_TEST_RECIPIENTS = 20;

export const TEST_SUBJECT_PREFIX = "[테스트] ";

// Where the unsubscribe link points in a test mail.
export const TEST_UNSUBSCRIBE_HREF = "#test-send";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTestEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) ? email : null;
}

export type TestRecipient = { email: string; active: boolean };

export type TestSendPayload = { from: string; to: string; subject: string; html: string };

export type TestSendPlan =
  | { ok: true; payloads: TestSendPayload[] }
  | { ok: false; error: string };

export function buildTestSendPayloads(input: {
  recipients: TestRecipient[];
  from: string;
  subject: string;
  html: string;
}): TestSendPlan {
  const emails = [
    ...new Set(input.recipients.filter((r) => r.active).map((r) => normalizeTestEmail(r.email)).filter((e): e is string => !!e)),
  ];
  if (emails.length === 0) {
    return { ok: false, error: "활성 테스트 계정이 없습니다. 구독자관리에서 테스트 계정을 먼저 등록해 주세요." };
  }
  if (emails.length > MAX_TEST_RECIPIENTS) {
    return { ok: false, error: `활성 테스트 계정이 ${emails.length}명입니다. 테스트 발송은 최대 ${MAX_TEST_RECIPIENTS}명까지만 보낼 수 있습니다.` };
  }

  const subject = input.subject.startsWith(TEST_SUBJECT_PREFIX) ? input.subject : `${TEST_SUBJECT_PREFIX}${input.subject}`;
  const html = input.html.replaceAll(RESEND_UNSUBSCRIBE_PLACEHOLDER, TEST_UNSUBSCRIBE_HREF);

  return { ok: true, payloads: emails.map((to) => ({ from: input.from, to, subject, html })) };
}

export type TestSendResult = { ok: true; sent: number } | { ok: false; error: string };

export type TestSendDeps = {
  loadRecipients: () => Promise<TestRecipient[]>;
  renderHtml: () => Promise<string>;
  sendBatch: (payloads: TestSendPayload[]) => Promise<{ error: { message: string } | null }>;
};

// Loads the list, renders, sends one batch. Never throws: every failure is
// returned as a message for the editor.
export async function sendNewsletterTest(
  input: { from: string; subject: string },
  deps: TestSendDeps,
): Promise<TestSendResult> {
  try {
    const recipients = await deps.loadRecipients();
    const plan = buildTestSendPayloads({ recipients, from: input.from, subject: input.subject, html: await deps.renderHtml() });
    if (!plan.ok) return plan;

    const { error } = await deps.sendBatch(plan.payloads);
    if (error) return { ok: false, error: `테스트 발송 실패: ${error.message}` };
    return { ok: true, sent: plan.payloads.length };
  } catch (err) {
    return { ok: false, error: `테스트 발송 실패: ${err instanceof Error ? err.message : String(err)}` };
  }
}
