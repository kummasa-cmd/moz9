import type { Resend } from "resend";
import { withRateLimitRetry, type RetryOptions } from "./resend-contacts";

// Resend account suppression list (Stage 4.5). Resend skips every address on
// it — transactional sends and Broadcasts alike ("email.suppressed") — so an
// address there can't receive the newsletter whatever Supabase / the Segment
// say. This module reads the list and classifies *why* an address is on it;
// suppression-reconcile.ts and the webhook apply the result to Supabase.
//
// Read-only: nothing here adds or removes suppressions.
//
// Classification (classifySuppression, pure):
//   origin=complaint                                        → COMPLAINT
//   origin=bounce + source email bounce.type = Permanent    → BOUNCE
//   anything else — manual, Transient / Undetermined bounce,
//   missing or malformed bounce field, lookup failure       → PROVIDER_SUPPRESSED
// Never guesses Permanent: the source email's `bounce` field is not part of
// the SDK types (resend ^6.18), so it is validated at runtime and anything
// unexpected falls back to PROVIDER_SUPPRESSED (fail-closed: the address
// still stops being a recipient, it just isn't claimed as a hard bounce).
//
// Privacy: never logs or returns addresses beyond what the caller passed
// in, never returns raw API responses or Resend's message text — errors are
// reduced to the API error name and status code.
//
// Kept free of Supabase / Next.js imports so it can be unit-tested.

export type ProviderOrigin = "bounce" | "complaint" | "manual";
export type ProviderSuppressionReason = "PROVIDER_SUPPRESSED" | "BOUNCE" | "COMPLAINT";

export type AccountSuppression = {
  id: string;
  // Lower-cased.
  email: string;
  origin: ProviderOrigin | null;
  sourceEmailId: string | null;
  createdAt: string | null;
};

export type SourceBounce = { type: string; subType: string | null };

export type BounceLookup =
  // bounce: null — the email exists but carries no (valid) bounce field.
  | { ok: true; bounce: SourceBounce | null }
  | { ok: false; error: string };

export type ClassificationBasis =
  | "complaint_origin"
  | "permanent_bounce"
  | "non_permanent_bounce"
  | "bounce_type_missing"
  | "bounce_lookup_failed"
  | "bounce_without_source"
  | "manual_origin"
  | "unknown_origin"
  | "suppression_lookup_failed";

export type SuppressionClassification = {
  reason: ProviderSuppressionReason;
  basis: ClassificationBasis;
  origin: ProviderOrigin | null;
  bounceType: string | null;
  bounceSubType: string | null;
  // The reason rests on data Resend returned (origin + bounce type), not on
  // the fail-closed default. Unverified suppressions are re-checked by the
  // reconciliation until they are.
  verified: boolean;
};

// The slice of the Resend SDK used here — lets tests pass a fake.
export type SuppressionListClient = { suppressions: { list: Resend["suppressions"]["list"] } };
export type SuppressionLookupClient = SuppressionListClient & {
  suppressions: { get: Resend["suppressions"]["get"] };
  emails: { get: Resend["emails"]["get"] };
};

type ApiErrorLike = { name?: unknown; statusCode?: unknown } | null | undefined;

// "not_found (404)" — no message text: Resend's messages can echo the address.
export function describeApiError(error: ApiErrorLike): string {
  const name = typeof error?.name === "string" && error.name ? error.name : "error";
  const status = typeof error?.statusCode === "number" ? ` (${error.statusCode})` : "";
  return `${name}${status}`;
}

function isNotFound(error: ApiErrorLike): boolean {
  return error?.statusCode === 404 || error?.name === "not_found";
}

// ---------------------------------------------------------------------------
// Runtime validation (pure)
// ---------------------------------------------------------------------------

export function parseProviderOrigin(value: unknown): ProviderOrigin | null {
  return value === "bounce" || value === "complaint" || value === "manual" ? value : null;
}

// Short identifier-like strings only (Permanent, General, OnAccountSuppressionList ...).
// Anything else — wrong type, free text, absurd length — is treated as absent.
export function sanitizeProviderToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(trimmed) ? trimmed : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// The `bounce` field of GET /emails/{id}. Undocumented in the SDK types, so
// every level is checked; a missing / malformed field yields null.
export function parseEmailBounce(body: unknown): SourceBounce | null {
  if (!body || typeof body !== "object") return null;
  const bounce = (body as { bounce?: unknown }).bounce;
  if (!bounce || typeof bounce !== "object") return null;
  const type = sanitizeProviderToken((bounce as { type?: unknown }).type);
  if (!type) return null;
  return { type, subType: sanitizeProviderToken((bounce as { subType?: unknown }).subType) };
}

export function parseAccountSuppression(entry: unknown): AccountSuppression | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const id = nonEmptyString(e.id);
  const email = nonEmptyString(e.email)?.toLowerCase() ?? null;
  if (!id || !email || !email.includes("@")) return null;
  return {
    id,
    email,
    origin: parseProviderOrigin(e.origin),
    sourceEmailId: nonEmptyString(e.source_id),
    createdAt: nonEmptyString(e.created_at),
  };
}

// ---------------------------------------------------------------------------
// Classification (pure)
// ---------------------------------------------------------------------------

export function classifySuppression(input: {
  origin: ProviderOrigin | null;
  sourceEmailId: string | null;
  // Result of looking up the source email; null when it wasn't looked up.
  bounceLookup: BounceLookup | null;
}): SuppressionClassification {
  const base = { origin: input.origin, bounceType: null, bounceSubType: null };

  if (input.origin === "complaint") {
    return { ...base, reason: "COMPLAINT", basis: "complaint_origin", verified: true };
  }
  if (input.origin === "manual") {
    return { ...base, reason: "PROVIDER_SUPPRESSED", basis: "manual_origin", verified: true };
  }
  if (input.origin !== "bounce") {
    return { ...base, reason: "PROVIDER_SUPPRESSED", basis: "unknown_origin", verified: false };
  }

  if (!input.sourceEmailId) {
    return { ...base, reason: "PROVIDER_SUPPRESSED", basis: "bounce_without_source", verified: false };
  }
  const lookup = input.bounceLookup;
  if (!lookup || !lookup.ok) {
    return { ...base, reason: "PROVIDER_SUPPRESSED", basis: "bounce_lookup_failed", verified: false };
  }
  if (!lookup.bounce) {
    return { ...base, reason: "PROVIDER_SUPPRESSED", basis: "bounce_type_missing", verified: false };
  }

  const bounced = { ...base, bounceType: lookup.bounce.type, bounceSubType: lookup.bounce.subType };
  if (lookup.bounce.type.toLowerCase() === "permanent") {
    return { ...bounced, reason: "BOUNCE", basis: "permanent_bounce", verified: true };
  }
  // Transient / Undetermined: Resend still refuses the address, but it isn't
  // a confirmed hard bounce.
  return { ...bounced, reason: "PROVIDER_SUPPRESSED", basis: "non_permanent_bounce", verified: true };
}

// The status a classification moves a SUBSCRIBED subscriber to — mirrors
// newsletter_apply_provider_suppression (0030).
export const PROVIDER_REASON_STATUS: Record<ProviderSuppressionReason, "UNSUBSCRIBED" | "BOUNCED" | "SUPPRESSED"> = {
  COMPLAINT: "UNSUBSCRIBED",
  BOUNCE: "BOUNCED",
  PROVIDER_SUPPRESSED: "SUPPRESSED",
};

// UNSUBSCRIBE < PROVIDER_SUPPRESSED < BOUNCE < COMPLAINT (0030 newsletter_suppression_rank).
export function suppressionRank(reason: string | null | undefined): number {
  switch (reason) {
    case "COMPLAINT":
      return 3;
    case "BOUNCE":
      return 2;
    case "PROVIDER_SUPPRESSED":
      return 1;
    case "UNSUBSCRIBE":
      return 0;
    default:
      return -1;
  }
}

// ---------------------------------------------------------------------------
// Resend reads
// ---------------------------------------------------------------------------

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

// Every account suppression. Throws on any API error, a malformed entry or a
// page that doesn't advance — a partial list must never pass as the whole
// list (the Broadcast preflight blocks on it).
export async function listAccountSuppressions(
  client: SuppressionListClient,
  retry: RetryOptions = {},
): Promise<AccountSuppression[]> {
  const all: AccountSuppression[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const options = { limit: PAGE_SIZE, ...(after ? { after } : {}) } as Parameters<SuppressionListClient["suppressions"]["list"]>[0];
    const response = await withRateLimitRetry(() => client.suppressions.list(options), retry);
    if (response.error) throw new Error(`Resend suppression 목록 조회 실패: ${describeApiError(response.error)}`);

    const data: unknown = response.data?.data;
    if (!Array.isArray(data)) throw new Error("Resend suppression 목록 형식이 올바르지 않습니다.");
    for (const entry of data) {
      const parsed = parseAccountSuppression(entry);
      if (!parsed) throw new Error("Resend suppression 항목 형식이 올바르지 않습니다.");
      all.push(parsed);
    }
    if (!response.data?.has_more) return all;

    const last = all[all.length - 1]?.id;
    if (data.length === 0 || !last || last === after) throw new Error("Resend suppression 목록 페이지가 진행되지 않습니다.");
    after = last;
  }
  throw new Error("Resend suppression 목록이 너무 깁니다.");
}

export type SuppressionLookup =
  | { ok: true; suppression: AccountSuppression | null }
  | { ok: false; error: string };

// One address. 404 → { ok: true, suppression: null } (not on the list).
export async function getAccountSuppression(
  client: SuppressionLookupClient,
  email: string,
  retry: RetryOptions = {},
): Promise<SuppressionLookup> {
  try {
    const response = await withRateLimitRetry(() => client.suppressions.get(email.trim().toLowerCase()), retry);
    if (response.error) {
      if (isNotFound(response.error)) return { ok: true, suppression: null };
      return { ok: false, error: describeApiError(response.error) };
    }
    const parsed = parseAccountSuppression(response.data);
    return parsed ? { ok: true, suppression: parsed } : { ok: false, error: "malformed_suppression" };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

// The source email's bounce field. Never throws.
export async function lookupSourceBounce(
  client: SuppressionLookupClient,
  emailId: string,
  retry: RetryOptions = {},
): Promise<BounceLookup> {
  try {
    const response = await withRateLimitRetry(() => client.emails.get(emailId), retry);
    if (response.error) return { ok: false, error: describeApiError(response.error) };
    return { ok: true, bounce: parseEmailBounce(response.data) };
  } catch {
    return { ok: false, error: "request_failed" };
  }
}

// Classifies one suppression, looking up the source email only when the
// origin is bounce. Never throws.
export async function classifyAccountSuppression(
  client: SuppressionLookupClient,
  suppression: { origin: ProviderOrigin | null; sourceEmailId: string | null },
  retry: RetryOptions = {},
): Promise<SuppressionClassification> {
  const bounceLookup =
    suppression.origin === "bounce" && suppression.sourceEmailId
      ? await lookupSourceBounce(client, suppression.sourceEmailId, retry)
      : null;
  return classifySuppression({ origin: suppression.origin, sourceEmailId: suppression.sourceEmailId, bounceLookup });
}

// ---------------------------------------------------------------------------
// Webhook-triggered check (email.suppressed / suppression.added)
// ---------------------------------------------------------------------------

export type ProviderSuppressionCheck = {
  trigger: "email.suppressed" | "suppression.added";
  // Lower-cased. Only for the lookup / DB match — never logged or stored on the event.
  email: string;
  // suppression.added carries the suppression itself; email.suppressed only
  // says the address was skipped, so the suppression is looked up.
  suppressionId: string | null;
  origin: ProviderOrigin | null;
  sourceEmailId: string | null;
};

export type ProviderSuppressionResolution =
  | {
      state: "suppressed";
      suppressionId: string | null;
      sourceEmailId: string | null;
      classification: SuppressionClassification;
    }
  | { state: "not_suppressed" };

// Fail-closed default when Resend can't be read: the event itself proves
// the address is (or was just) suppressed, so it stops being a recipient —
// as PROVIDER_SUPPRESSED, unverified, for the reconciliation to confirm.
export function unverifiedSuppression(check: ProviderSuppressionCheck): ProviderSuppressionResolution {
  return {
    state: "suppressed",
    suppressionId: check.suppressionId,
    sourceEmailId: check.sourceEmailId,
    classification: {
      reason: "PROVIDER_SUPPRESSED",
      basis: "suppression_lookup_failed",
      origin: check.origin,
      bounceType: null,
      bounceSubType: null,
      verified: false,
    },
  };
}

// Never throws.
//   suppression.added  → classify from the payload (origin, source_id)
//   email.suppressed   → GET /suppressions/{email}; 404 = no longer on the
//                        list (nothing to apply); any other failure =
//                        fail-closed PROVIDER_SUPPRESSED
export async function resolveProviderSuppression(
  client: SuppressionLookupClient,
  check: ProviderSuppressionCheck,
  retry: RetryOptions = {},
): Promise<ProviderSuppressionResolution> {
  try {
    if (check.trigger === "suppression.added") {
      const classification = await classifyAccountSuppression(client, check, retry);
      return { state: "suppressed", suppressionId: check.suppressionId, sourceEmailId: check.sourceEmailId, classification };
    }

    const lookup = await getAccountSuppression(client, check.email, retry);
    if (!lookup.ok) return unverifiedSuppression(check);
    if (!lookup.suppression) return { state: "not_suppressed" };

    const suppression = lookup.suppression;
    const classification = await classifyAccountSuppression(client, suppression, retry);
    return { state: "suppressed", suppressionId: suppression.id, sourceEmailId: suppression.sourceEmailId, classification };
  } catch {
    return unverifiedSuppression(check);
  }
}
