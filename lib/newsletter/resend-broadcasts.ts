import { Resend, type CreateBroadcastOptions } from "resend";
import { installSdkErrorLogger, redactEmails, withRateLimitRetry, type RetryOptions } from "./resend-contacts";

// Resend Broadcast API wrapper (3단계). Every call goes through the official
// SDK (resend ^6.18: broadcasts.create / broadcasts.send) — no raw HTTP.
//
// A Broadcast is always created as a *draft* first and sent in a separate
// call. Creating a draft sends nothing, so the caller can store the draft's
// id before anything goes out; see broadcast-sender.ts for why that ordering
// is the duplicate-send guard.
//
// Kept free of Supabase / Next.js imports so it can be unit-tested with a
// fake client.

// The slice of the Resend SDK this module touches — lets tests pass a fake.
export type ResendBroadcastsClient = {
  broadcasts: {
    create: Resend["broadcasts"]["create"];
    send: Resend["broadcasts"]["send"];
  };
};

// Resend's own unsubscribe link. With it in the HTML, Resend fills in a
// per-contact URL, flips that Contact to unsubscribed, and adds the
// List-Unsubscribe / one-click headers. Triple braces = not HTML-escaped.
export const RESEND_UNSUBSCRIBE_PLACEHOLDER = "{{{RESEND_UNSUBSCRIBE_URL}}}";

type ApiError = { message: string; statusCode: number | null; name: string };

export type BroadcastFailure = {
  ok: false;
  error: string;
  statusCode: number | null;
  // 429 (rate limit) or a network failure.
  retryable: boolean;
};

export type BroadcastResult = { ok: true; broadcastId: string } | BroadcastFailure;

// Masks email addresses, Resend API keys and bearer tokens, for anything that
// ends up in logs or in newsletter_broadcast_sends.last_error.
export function redactSecrets(text: string): string {
  return redactEmails(text)
    .replace(/\bre_[A-Za-z0-9_]{6,}/g, "re_***")
    .replace(/\bwhsec_[A-Za-z0-9+/=_-]{6,}/g, "whsec_***")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer ***");
}

function truncate(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isRateLimited(error: ApiError): boolean {
  return (
    (error.statusCode === 429 || error.name === "rate_limit_exceeded") &&
    error.name !== "daily_quota_exceeded" &&
    error.name !== "monthly_quota_exceeded"
  );
}

function failure(error: ApiError): BroadcastFailure {
  const status = error.statusCode === null ? "network" : String(error.statusCode);
  return {
    ok: false,
    error: truncate(redactSecrets(`${error.name} (${status}): ${error.message}`)),
    statusCode: error.statusCode,
    retryable: isRateLimited(error) || error.statusCode === null,
  };
}

function thrownFailure(err: unknown): BroadcastFailure {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: truncate(redactSecrets(message)), statusCode: null, retryable: true };
}

export type BroadcastContent = {
  // Internal name shown in the Resend dashboard.
  name: string;
  segmentId: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string | string[] | null;
  previewText?: string | null;
};

export type PayloadResult = { ok: true; payload: CreateBroadcastOptions } | { ok: false; error: string };

// Validates the content and builds the draft create payload (send: false).
//   - The HTML must carry Resend's unsubscribe placeholder exactly once: it
//     is the only unsubscribe link a Broadcast email may have (see
//     email.ts::toBroadcastHtml, which swaps our own link out).
//   - No other "{{" may appear — Resend would treat it as a template
//     variable and render newsletter text wrongly (or fail the send).
export function buildBroadcastPayload(content: BroadcastContent): PayloadResult {
  const name = content.name.trim();
  const from = content.from.trim();
  const subject = content.subject.trim();

  if (!content.segmentId.trim()) return { ok: false, error: "segmentId가 비어 있습니다." };
  if (!from) return { ok: false, error: "발신자(from)가 비어 있습니다." };
  if (!subject) return { ok: false, error: "제목(subject)이 비어 있습니다." };
  if (!content.html.trim()) return { ok: false, error: "HTML 본문이 비어 있습니다." };

  const placeholderCount = content.html.split(RESEND_UNSUBSCRIBE_PLACEHOLDER).length - 1;
  if (placeholderCount !== 1) {
    return { ok: false, error: `수신거부 placeholder가 정확히 1개여야 합니다 (현재 ${placeholderCount}개).` };
  }
  if (content.html.replace(RESEND_UNSUBSCRIBE_PLACEHOLDER, "").includes("{{")) {
    return { ok: false, error: "본문에 Resend 변수 문법({{)과 충돌하는 문자열이 있습니다." };
  }

  const replyTo = Array.isArray(content.replyTo)
    ? content.replyTo.map((r) => r.trim()).filter(Boolean)
    : content.replyTo?.trim() || undefined;
  const previewText = content.previewText?.trim() || undefined;

  return {
    ok: true,
    payload: {
      name: name || subject,
      segmentId: content.segmentId.trim(),
      from,
      subject,
      html: content.html,
      ...(replyTo && replyTo.length > 0 ? { replyTo } : {}),
      ...(previewText ? { previewText } : {}),
      send: false,
    },
  };
}

// Own sanity cap on how far ahead a send may be scheduled.
export const MAX_SCHEDULE_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;
// Anything sooner is treated as a mistake rather than "send now".
export const MIN_SCHEDULE_AHEAD_MS = 60 * 1000;

const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

export type ScheduleResult = { ok: true; scheduledAt: string | null } | { ok: false; error: string };

// Normalizes an optional schedule time to a UTC ISO string for Resend's
// scheduled_at. Resend also accepts natural language ("in 1 hour"); we only
// accept ISO 8601 *with* a zone (Z or +09:00), so a KST wall-clock time can
// never be misread as UTC.
export function normalizeScheduledAt(value: string | null | undefined, now: Date = new Date()): ScheduleResult {
  const raw = value?.trim();
  if (!raw) return { ok: true, scheduledAt: null };
  if (!ISO_WITH_ZONE.test(raw)) {
    return { ok: false, error: "예약 시간은 시간대가 포함된 ISO 8601 형식이어야 합니다 (예: 2026-10-01T09:00:00+09:00)." };
  }
  const time = new Date(raw).getTime();
  if (Number.isNaN(time)) return { ok: false, error: "예약 시간을 해석할 수 없습니다." };

  const ahead = time - now.getTime();
  if (ahead < MIN_SCHEDULE_AHEAD_MS) return { ok: false, error: "예약 시간은 현재로부터 1분 이후여야 합니다." };
  if (ahead > MAX_SCHEDULE_AHEAD_MS) return { ok: false, error: "예약 시간은 30일 이내여야 합니다." };
  return { ok: true, scheduledAt: new Date(time).toISOString() };
}

// Creates the Broadcast as a draft. Nothing is sent. 429s are retried with
// backoff (a rate-limited request was not processed, so a retry can't make a
// second draft).
export async function createBroadcastDraft(
  client: ResendBroadcastsClient,
  payload: CreateBroadcastOptions,
  retry: RetryOptions = {},
): Promise<BroadcastResult> {
  if (payload.send) {
    return { ok: false, error: "초안 생성 payload에 send=true가 들어 있습니다.", statusCode: null, retryable: false };
  }
  try {
    const response = await withRateLimitRetry(() => client.broadcasts.create(payload), retry);
    if (response.error) return failure(response.error);
    return { ok: true, broadcastId: response.data.id };
  } catch (err) {
    return thrownFailure(err);
  }
}

// Sends (or schedules, with scheduledAt) a previously created draft.
export async function sendBroadcast(
  client: ResendBroadcastsClient,
  broadcastId: string,
  options: { scheduledAt?: string | null } = {},
  retry: RetryOptions = {},
): Promise<BroadcastResult> {
  if (!broadcastId.trim()) {
    return { ok: false, error: "broadcastId가 비어 있습니다.", statusCode: null, retryable: false };
  }
  try {
    const response = await withRateLimitRetry(
      () => client.broadcasts.send(broadcastId, options.scheduledAt ? { scheduledAt: options.scheduledAt } : undefined),
      retry,
    );
    if (response.error) return failure(response.error);
    return { ok: true, broadcastId: response.data.id };
  } catch (err) {
    return thrownFailure(err);
  }
}

// Resend client for Broadcasts with the email-masking SDK error logger.
export function createBroadcastsClient(apiKey: string | undefined = process.env.RESEND_API_KEY): Resend {
  if (!apiKey) throw new Error("RESEND_API_KEY가 설정되지 않았습니다.");
  return installSdkErrorLogger(new Resend(apiKey));
}
