import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { fetchAllRows } from "./paginate";
import { isSuppressionNewerThanSync } from "./resend-contacts";
import { redactSecrets } from "./resend-broadcasts";
import { listAccountSuppressions, type SuppressionListClient } from "./resend-suppressions";

// Broadcast preflight (B1, third line of defence).
//
//   1st: every status change syncs the Resend Contact right away
//   2nd: the contact-sync cron retries anything pending / suppressed since
//        its last sync (contact-sync.ts::retryPendingContactSyncs)
//   3rd: this check, right before a Broadcast is reserved / created / sent
//
// A Broadcast goes to every *subscribed Contact in the Resend segment* — Resend
// never looks at Supabase. So this compares the actual segment with Supabase
// and blocks the send (fail-closed) whenever someone who must not receive it
// could: we'd rather send nothing than mail a person who opted out.
//
// Stage 4.5: it also reads the Resend *account suppression* list. Resend
// skips those addresses whatever the segment says, so a subscribed Contact
// on it means Supabase / the segment no longer describe who receives the
// issue (counts, stats, and an address we keep treating as a reader). That
// blocks too, as does failing to read the list; the contact-sync
// reconciliation clears it and the 2-hour preflight retry then sends.
//
// Kept free of Next.js imports; the evaluation is pure and unit-tested.

export type PreflightSubscriber = {
  id: string;
  email: string;
  status: string;
  resend_contact_id: string | null;
  resend_synced_at: string | null;
  resend_sync_error: string | null;
};

export type PreflightSuppression = { email: string; unsubscribed_at: string };

export type SegmentContact = { id: string; email: string; unsubscribed: boolean };

export type PreflightAccountSuppression = { email: string };

export type PreflightIssueCode =
  // blocking — someone who opted out could receive the Broadcast
  | "SEGMENT_READ_FAILED"
  | "SUPPRESSION_READ_FAILED"
  | "RESEND_SUBSCRIBED_NOT_ELIGIBLE"
  // blocking — a subscribed Contact is on the Resend account suppression list
  | "RESEND_SUPPRESSED_BUT_SUBSCRIBED"
  | "RESEND_SUBSCRIBED_UNKNOWN"
  | "NOT_ELIGIBLE_UNSYNCED"
  // warnings — an eligible subscriber would miss this issue
  | "ELIGIBLE_UNSYNCED"
  | "ELIGIBLE_NOT_IN_SEGMENT"
  // blocking — too many eligible subscribers would miss it
  | "ELIGIBLE_GAP_TOO_LARGE";

export type PreflightIssue = {
  code: PreflightIssueCode;
  count: number;
  // Subscriber ids (or Resend contact ids for unknown contacts) — never emails.
  sampleIds: string[];
};

export type PreflightResult = {
  ok: boolean;
  blocking: PreflightIssue[];
  warnings: PreflightIssue[];
  eligible: number;
  // Subscribed contacts in the Resend segment = who the Broadcast would reach.
  segmentSubscribed: number;
};

// Eligible subscribers missing from the send (not synced / not subscribed in
// the segment) are a delivery gap, not a privacy risk: the recipient set is
// the segment, which the blocking checks already prove contains only
// eligible people. A few such rows (e.g. one address Resend permanently
// rejects) therefore only warn — otherwise a single bad address would stop
// the newsletter for everyone. Past this size the gap means the sync itself
// is broken, and the send is blocked until it's fixed.
export const ELIGIBLE_GAP_BLOCK_COUNT = 5;
export const ELIGIBLE_GAP_BLOCK_RATIO = 0.05;

const SAMPLE_SIZE = 5;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

function issue(code: PreflightIssueCode, ids: string[]): PreflightIssue {
  return { code, count: ids.length, sampleIds: ids.slice(0, SAMPLE_SIZE) };
}

export function isEligibleGapTooLarge(gap: number, eligible: number): boolean {
  if (gap === 0) return false;
  return gap > ELIGIBLE_GAP_BLOCK_COUNT || gap / Math.max(eligible, 1) > ELIGIBLE_GAP_BLOCK_RATIO;
}

export function evaluateBroadcastPreflight(input: {
  subscribers: PreflightSubscriber[];
  suppressions: PreflightSuppression[];
  segmentContacts: SegmentContact[];
  accountSuppressions: PreflightAccountSuppression[];
}): PreflightResult {
  const suppressedAt = new Map(input.suppressions.map((s) => [normalize(s.email), s.unsubscribed_at]));
  const byEmail = new Map(input.subscribers.map((s) => [normalize(s.email), s]));
  const isEligible = (s: PreflightSubscriber) => s.status === "SUBSCRIBED" && !suppressedAt.has(normalize(s.email));

  const segment = new Map(input.segmentContacts.map((c) => [normalize(c.email), c]));
  const segmentSubscribed = input.segmentContacts.filter((c) => !c.unsubscribed);

  const accountSuppressed = new Set(input.accountSuppressions.map((s) => normalize(s.email)));

  // Who the Broadcast would actually reach, checked one by one.
  const notEligibleButSubscribed: string[] = [];
  const unknownButSubscribed: string[] = [];
  const suppressedButSubscribed: string[] = [];
  for (const contact of segmentSubscribed) {
    const row = byEmail.get(normalize(contact.email));
    if (!row) unknownButSubscribed.push(contact.id);
    else if (!isEligible(row)) notEligibleButSubscribed.push(row.id);
    // Subscriber id when we have one, else the Contact id — never the address.
    if (accountSuppressed.has(normalize(contact.email))) suppressedButSubscribed.push(row?.id ?? contact.id);
  }

  // Supabase-side: opted-out rows whose opt-out may not have reached Resend.
  // Redundant with the segment check above on purpose — two independent
  // signals, either one blocks.
  const notEligibleUnsynced: string[] = [];
  const eligibleUnsynced: string[] = [];
  const eligibleNotInSegment: string[] = [];
  for (const row of input.subscribers) {
    const email = normalize(row.email);
    const unsynced =
      !row.resend_synced_at ||
      !!row.resend_sync_error ||
      isSuppressionNewerThanSync(row.resend_synced_at, suppressedAt.get(email) ?? null);

    if (!isEligible(row)) {
      if (unsynced) notEligibleUnsynced.push(row.id);
      continue;
    }
    if (unsynced || !row.resend_contact_id) eligibleUnsynced.push(row.id);
    const contact = segment.get(email);
    if (!contact || contact.unsubscribed) eligibleNotInSegment.push(row.id);
  }

  const eligible = input.subscribers.filter(isEligible).length;
  const gap = new Set([...eligibleUnsynced, ...eligibleNotInSegment]).size;

  const blocking: PreflightIssue[] = [];
  if (notEligibleButSubscribed.length) blocking.push(issue("RESEND_SUBSCRIBED_NOT_ELIGIBLE", notEligibleButSubscribed));
  if (unknownButSubscribed.length) blocking.push(issue("RESEND_SUBSCRIBED_UNKNOWN", unknownButSubscribed));
  if (suppressedButSubscribed.length) blocking.push(issue("RESEND_SUPPRESSED_BUT_SUBSCRIBED", suppressedButSubscribed));
  if (notEligibleUnsynced.length) blocking.push(issue("NOT_ELIGIBLE_UNSYNCED", notEligibleUnsynced));
  if (isEligibleGapTooLarge(gap, eligible)) {
    blocking.push(issue("ELIGIBLE_GAP_TOO_LARGE", [...new Set([...eligibleUnsynced, ...eligibleNotInSegment])]));
  }

  const warnings: PreflightIssue[] = [];
  if (eligibleUnsynced.length) warnings.push(issue("ELIGIBLE_UNSYNCED", eligibleUnsynced));
  if (eligibleNotInSegment.length) warnings.push(issue("ELIGIBLE_NOT_IN_SEGMENT", eligibleNotInSegment));

  return { ok: blocking.length === 0, blocking, warnings, eligible, segmentSubscribed: segmentSubscribed.length };
}

function readFailed(codes: ("SEGMENT_READ_FAILED" | "SUPPRESSION_READ_FAILED")[]): PreflightResult {
  return {
    ok: false,
    blocking: codes.map((code) => ({ code, count: 0, sampleIds: [] })),
    warnings: [],
    eligible: 0,
    segmentSubscribed: 0,
  };
}

export function segmentReadFailed(): PreflightResult {
  return readFailed(["SEGMENT_READ_FAILED"]);
}

const LABELS: Record<PreflightIssueCode, string> = {
  SEGMENT_READ_FAILED: "Resend Segment 또는 구독자 목록 조회 실패",
  SUPPRESSION_READ_FAILED: "Resend 계정 suppression 목록 조회 실패",
  RESEND_SUBSCRIBED_NOT_ELIGIBLE: "Resend 구독인데 Supabase 수신 비대상",
  RESEND_SUBSCRIBED_UNKNOWN: "Resend 구독인데 Supabase에 없는 Contact",
  RESEND_SUPPRESSED_BUT_SUBSCRIBED: "Segment 구독인데 Resend 계정 suppression 대상",
  NOT_ELIGIBLE_UNSYNCED: "수신 비대상인데 Resend 미동기화",
  ELIGIBLE_UNSYNCED: "수신 대상인데 Resend 미동기화",
  ELIGIBLE_NOT_IN_SEGMENT: "수신 대상인데 Segment에서 구독 아님",
  ELIGIBLE_GAP_TOO_LARGE: `수신 대상 누락이 기준(${ELIGIBLE_GAP_BLOCK_COUNT}명 또는 ${ELIGIBLE_GAP_BLOCK_RATIO * 100}%) 초과`,
};

// Admin-facing summary for newsletter_campaigns.last_error. Counts and ids
// only — never an email address.
export function describePreflightIssues(issues: PreflightIssue[]): string {
  return issues
    .map((i) => {
      const noCount = i.code === "SEGMENT_READ_FAILED" || i.code === "SUPPRESSION_READ_FAILED";
      const count = noCount ? "" : ` ${i.count}건`;
      const ids = i.sampleIds.length ? ` (${i.sampleIds.map((id) => id.slice(0, 8)).join(", ")}${i.count > i.sampleIds.length ? ", …" : ""})` : "";
      return `${LABELS[i.code]}${count}${ids}`;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Inputs (read-only)
// ---------------------------------------------------------------------------

export type SegmentContactsClient = { contacts: { list: Resend["contacts"]["list"] } };
// What the preflight reads from Resend: the segment and the account suppression list.
export type PreflightClient = SegmentContactsClient & SuppressionListClient;

const SEGMENT_PAGE_SIZE = 100;
const MAX_SEGMENT_PAGES = 1000;

// Every contact in the segment. Throws on any API error or a page that
// doesn't advance — a partial list must never pass as the whole segment.
export async function listSegmentContacts(client: SegmentContactsClient, segmentId: string): Promise<SegmentContact[]> {
  const contacts: SegmentContact[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_SEGMENT_PAGES; page++) {
    const response = await client.contacts.list({
      segmentId,
      limit: SEGMENT_PAGE_SIZE,
      ...(after ? { after } : {}),
    } as Parameters<SegmentContactsClient["contacts"]["list"]>[0]);
    if (response.error) throw new Error(`${response.error.name}: ${response.error.message}`);

    const data = response.data.data;
    contacts.push(...data.map((c) => ({ id: c.id, email: c.email, unsubscribed: c.unsubscribed })));
    if (!response.data.has_more) return contacts;

    const last = data[data.length - 1]?.id;
    if (!last || last === after) throw new Error("Segment 목록 페이지가 진행되지 않습니다.");
    after = last;
  }
  throw new Error("Segment 목록이 너무 깁니다.");
}

export async function loadPreflightDbInputs(
  db: SupabaseClient,
): Promise<{ subscribers: PreflightSubscriber[]; suppressions: PreflightSuppression[] }> {
  const [subscribers, suppressions] = await Promise.all([
    fetchAllRows<PreflightSubscriber>((from, to) =>
      db
        .from("newsletter_subscribers")
        .select("id, email, status, resend_contact_id, resend_synced_at, resend_sync_error")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<PreflightSuppression>((from, to) =>
      db.from("newsletter_suppressions").select("email, unsubscribed_at").order("id").range(from, to),
    ),
  ]);
  return { subscribers, suppressions };
}

function logReadFailure(what: string, err: unknown) {
  console.error(
    `[newsletter] Broadcast preflight ${what} 조회 실패:`,
    redactSecrets(err instanceof Error ? err.message : String(err)),
  );
}

// Runs the whole check. Never throws: any read failure is a blocking result.
export async function runBroadcastPreflight(
  db: SupabaseClient,
  client: PreflightClient,
  segmentId: string,
): Promise<PreflightResult> {
  const [base, suppressions] = await Promise.allSettled([
    Promise.all([loadPreflightDbInputs(db), listSegmentContacts(client, segmentId)]),
    listAccountSuppressions(client),
  ]);

  const failed: ("SEGMENT_READ_FAILED" | "SUPPRESSION_READ_FAILED")[] = [];
  if (base.status === "rejected") {
    logReadFailure("입력", base.reason);
    failed.push("SEGMENT_READ_FAILED");
  }
  if (suppressions.status === "rejected") {
    logReadFailure("Resend suppression 목록", suppressions.reason);
    failed.push("SUPPRESSION_READ_FAILED");
  }
  if (base.status === "rejected" || suppressions.status === "rejected") return readFailed(failed);

  const [dbInputs, segmentContacts] = base.value;
  return evaluateBroadcastPreflight({ ...dbInputs, segmentContacts, accountSuppressions: suppressions.value });
}
