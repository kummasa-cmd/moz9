import type { Resend } from "resend";

// Resend Contacts sync core (2단계). Only the regular newsletter's
// newsletter_subscribers rows are mirrored here — promotional prospects are
// intentionally out of scope. Nothing in this file sends email.
//
// Kept free of Supabase / Next.js imports so it can be unit-tested with a
// fake client; the DB wiring lives in ./contact-sync.ts.

// The slice of the Resend SDK this module touches — lets tests pass a fake.
export type ResendContactsClient = {
  contacts: {
    create: Resend["contacts"]["create"];
    update: Resend["contacts"]["update"];
    segments: {
      list: Resend["contacts"]["segments"]["list"];
      add: Resend["contacts"]["segments"]["add"];
    };
  };
};

type ApiError = { message: string; statusCode: number | null; name: string };
// Shape shared by every Resend SDK response; generic over the concrete SDK
// type so callers keep its data/error narrowing.
type ApiResponse = { error: ApiError | null; headers: Record<string, string> | null };

export type ContactSyncFailure = {
  ok: false;
  error: string;
  // 429 (rate limit) or a network failure — worth retrying later.
  retryable: boolean;
};

export type ContactSyncResult =
  // contactId is null only when createIfMissing=false and Resend had no
  // Contact for the email — nothing to mark unsubscribed, which is fine.
  | { ok: true; contactId: string | null; created: boolean }
  | ContactSyncFailure;

export type UpsertContactInput = {
  email: string;
  unsubscribed: boolean;
  firstName?: string | null;
  // Previously stored resend_contact_id, if any — tried first.
  contactId?: string | null;
  // Optional Resend segment the contact should belong to (for 3단계 Broadcast).
  segmentId?: string | null;
  // false: only update an existing Contact. Used for unsubscribes, so an
  // address Resend never knew about isn't created just to be opted out.
  createIfMissing?: boolean;
};

// newsletter_subscribers.status → Resend `unsubscribed`. Only SUBSCRIBED rows
// that are also off the do-not-contact list may receive mail; UNSUBSCRIBED,
// BOUNCED and suppressed emails are all mirrored as unsubscribed=true, which
// matches what the legacy batch path (getTargetSubscribers) sends to.
export function isContactUnsubscribed(status: string, suppressed = false): boolean {
  return status !== "SUBSCRIBED" || suppressed;
}

// True when the address was put on the do-not-contact list after the row's
// last successful Resend sync — i.e. Resend may still have the Contact as
// subscribed. Some paths add a suppression without touching the subscriber
// row (e.g. a promotional-newsletter unsubscribe for an address that is also
// a subscriber), so resend_synced_at alone can't tell such a row is stale.
// Timestamps are the DB's own (newsletter_suppressions.unsubscribed_at
// defaults to now()); equal times count as in sync.
export function isSuppressionNewerThanSync(syncedAt: string | null, suppressedAt: string | null): boolean {
  if (!suppressedAt) return false;
  if (!syncedAt) return true;
  return new Date(suppressedAt).getTime() > new Date(syncedAt).getTime();
}

// Masks anything shaped like an email address, for console output.
export function redactEmails(text: string): string {
  return text.replace(/[^\s"'/<>@]+@[^\s"'/<>,;]+/g, "<email>");
}

type SdkErrorLogger = (error: ApiError, path?: string, status?: number) => void;

// Replacement for the Resend SDK's internal error logger. Outside production
// the SDK console.errors every API error together with the request path —
// and upsertResendContact's normal "does this email have a Contact yet?"
// lookup is PATCH /contacts/<email>, so every new subscriber would print
// their address with a 404. This logger:
//   - drops 404s on /contacts paths (the expected lookup miss; the caller
//     handles it by creating the Contact),
//   - logs every other error as before, with email addresses masked.
// Like the SDK, it stays silent in production (callers log failures there).
export function createSdkErrorLogger(log: (...args: unknown[]) => void = console.error): SdkErrorLogger {
  return (error, path, status) => {
    if (process.env.NODE_ENV === "production") return;
    if (isNotFound(error) && path?.startsWith("/contacts")) return;

    let readablePath = path;
    try {
      readablePath = path === undefined ? undefined : decodeURIComponent(path);
    } catch {
      // keep the raw path if it isn't valid URI encoding
    }

    log("[Resend API Error]:", {
      ...(status !== undefined ? { status } : {}),
      error: { ...error, message: redactEmails(String(error.message ?? "")) },
      ...(readablePath !== undefined ? { path: redactEmails(readablePath) } : {}),
    });
  };
}

// Swaps the SDK's private logError on one Resend instance for
// createSdkErrorLogger. Relies on SDK internals (resend ^6.18: `this.logError`
// is called from fetchRequest) — resend-contacts.test.ts checks it's still there.
export function installSdkErrorLogger<T extends object>(resend: T, logger = createSdkErrorLogger()): T {
  (resend as unknown as { logError: SdkErrorLogger }).logError = logger;
  return resend;
}

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isRateLimited(error: ApiError): boolean {
  return error.statusCode === 429 || error.name === "rate_limit_exceeded";
}

// Daily/monthly quota errors are also 429 but won't clear within a backoff
// window — retrying them only burns time.
function isQuotaExceeded(error: ApiError): boolean {
  return error.name === "daily_quota_exceeded" || error.name === "monthly_quota_exceeded";
}

function isNotFound(error: ApiError): boolean {
  return error.statusCode === 404 || error.name === "not_found";
}

function isNetworkFailure(error: ApiError): boolean {
  return error.statusCode === null;
}

function retryAfterMs(headers: Record<string, string> | null): number | null {
  const raw = headers?.["retry-after"];
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

// Calls `request` and retries on 429 with exponential backoff (honoring the
// Retry-After header when Resend sends one). Other errors return immediately.
export async function withRateLimitRetry<R extends ApiResponse>(
  request: () => Promise<R>,
  options: RetryOptions = {},
): Promise<R> {
  const { maxRetries = 5, baseDelayMs = 1000, maxDelayMs = 30_000, sleep = defaultSleep } = options;

  for (let attempt = 0; ; attempt++) {
    const response = await request();
    if (!response.error) return response;
    if (!isRateLimited(response.error) || isQuotaExceeded(response.error)) return response;
    if (attempt >= maxRetries) return response;

    const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
    await sleep(Math.max(backoff, retryAfterMs(response.headers) ?? 0));
  }
}

function failure(error: ApiError): ContactSyncFailure {
  return {
    ok: false,
    error: `${error.name}: ${error.message}`,
    retryable: (isRateLimited(error) && !isQuotaExceeded(error)) || isNetworkFailure(error),
  };
}

// Creates or updates the Resend Contact for `email` so its `unsubscribed`
// flag matches our DB. Safe to call repeatedly and safe when a Contact with
// this email already exists in Resend (e.g. created from the dashboard):
//   1. update by stored contact id (if we have one)
//   2. update by email
//   3. create — and if that loses a race to a concurrent create, update again
// Never throws; failures come back as { ok: false }.
export async function upsertResendContact(
  client: ResendContactsClient,
  input: UpsertContactInput,
  retry: RetryOptions = {},
): Promise<ContactSyncResult> {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName?.trim() || undefined;
  const common = { unsubscribed: input.unsubscribed, ...(firstName ? { firstName } : {}) };

  try {
    let contactId: string | null = null;
    let created = false;

    if (input.contactId) {
      const byId = await withRateLimitRetry(
        () => client.contacts.update({ id: input.contactId!, ...common }),
        retry,
      );
      if (!byId.error) contactId = byId.data.id;
      else if (!isNotFound(byId.error)) return failure(byId.error);
    }

    if (!contactId) {
      const byEmail = await withRateLimitRetry(() => client.contacts.update({ email, ...common }), retry);
      if (!byEmail.error) contactId = byEmail.data.id;
      else if (!isNotFound(byEmail.error)) return failure(byEmail.error);
    }

    if (!contactId && input.createIfMissing === false) {
      return { ok: true, contactId: null, created: false };
    }

    if (!contactId) {
      const segments = input.segmentId ? [{ id: input.segmentId }] : undefined;
      const create = await withRateLimitRetry(
        () => client.contacts.create({ email, ...common, ...(segments ? { segments } : {}) }),
        retry,
      );

      if (!create.error) {
        contactId = create.data.id;
        created = true;
      } else if (isRateLimited(create.error) || isNetworkFailure(create.error)) {
        return failure(create.error);
      } else {
        // Most likely a concurrent request created it first — converge on it.
        const again = await withRateLimitRetry(() => client.contacts.update({ email, ...common }), retry);
        if (again.error) return failure(create.error);
        contactId = again.data.id;
      }
    }

    if (input.segmentId && !created) {
      const segment = await ensureInSegment(client, contactId, input.segmentId, retry);
      if (!segment.ok) return segment;
    }

    return { ok: true, contactId, created };
  } catch (err) {
    // The SDK reports HTTP errors as values, but guard anyway so a sync bug
    // can never break the subscribe / unsubscribe flow that called it.
    return { ok: false, error: err instanceof Error ? err.message : String(err), retryable: true };
  }
}

// Adds the contact to the segment unless it's already there (checked first so
// repeated syncs don't depend on how Resend answers a duplicate add).
async function ensureInSegment(
  client: ResendContactsClient,
  contactId: string,
  segmentId: string,
  retry: RetryOptions,
): Promise<{ ok: true } | ContactSyncFailure> {
  const list = await withRateLimitRetry(() => client.contacts.segments.list({ contactId, limit: 100 }), retry);
  if (list.error) return failure(list.error);
  if (list.data.data.some((segment) => segment.id === segmentId)) return { ok: true };

  const add = await withRateLimitRetry(() => client.contacts.segments.add({ contactId, segmentId }), retry);
  if (add.error) return failure(add.error);
  return { ok: true };
}
