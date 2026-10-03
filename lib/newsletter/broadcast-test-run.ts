import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBroadcastSegment } from "./delivery-mode";
import type { ContentBlock } from "./blocks/types";
import {
  describePreflightIssues,
  listSegmentContacts,
  runBroadcastPreflight,
  type PreflightClient,
  type PreflightResult,
} from "./broadcast-preflight";

// B2: a real campaign sent through processCampaign() → claimCampaign() →
// the Broadcast sender, but only to the TEST segment.
//
// Reached only from scripts/newsletter/b2-campaign-broadcast.ts, which passes
// processCampaign({ broadcastTest }). No admin action, cron or HTTP route
// passes that option (guarded by broadcast-test-run.test.ts). With it:
//   - the Broadcast path is forced for that one invocation only — the global
//     NEWSLETTER_DELIVERY_MODE is neither read nor needed;
//   - the segment comes from resolveBroadcastSegment("test"), never "campaign";
//   - every failed check is an error: no legacy fallback, no fallback to the
//     real subscriber segment;
//   - no issue number, no board-post usage count.
//
// Kept free of Next.js imports; the checks are pure and unit-tested.

export type BroadcastTestTarget = { segmentId: string };

// A test segment is a handful of addresses. Anything bigger is treated as a
// mislabelled real segment.
export const BROADCAST_TEST_MAX_CONTACTS = 5;

type Env = Record<string, string | undefined>;

type Check = { ok: true } | { ok: false; error: string };

// Far enough ahead that isCampaignDue() is false for a SCHEDULED campaign, so
// send-due never picks it up (and never on the legacy path). The script hands
// the id straight to processCampaign({ trigger: "manual" }), whose claim only
// requires status SCHEDULED.
//
// It is also the B2 marker, checked both ways in processCampaign: a B2 run
// only accepts a campaign carrying it, and an ordinary run (admin "지금 발송",
// cron) refuses one — so a B2 campaign left behind by a crashed script can't
// be sent to the real segment.
export const BROADCAST_TEST_SCHEDULED_AT = "2099-12-31T00:00:00.000Z";

export function isBroadcastTestCampaign(campaign: { send_type: string; scheduled_at: string | null }): boolean {
  if (campaign.send_type !== "SCHEDULED" || !campaign.scheduled_at) return false;
  return new Date(campaign.scheduled_at).getTime() === new Date(BROADCAST_TEST_SCHEDULED_AT).getTime();
}

type BroadcastTestCampaignShape = {
  audience: string;
  target_all: boolean;
  target_tags: string[] | null;
  send_type: string;
  scheduled_at: string | null;
};

// Only a plain all-subscribers campaign can take the Broadcast path, so only
// that shape is accepted for B2 — and only on a campaign the B2 script made.
export function checkBroadcastTestCampaign(campaign: BroadcastTestCampaignShape): Check {
  if (!isBroadcastTestCampaign(campaign)) {
    return { ok: false, error: "[B2] B2 스크립트가 만든 테스트 캠페인(2099 예약)이 아닙니다." };
  }
  if (campaign.audience !== "SUBSCRIBERS") {
    return { ok: false, error: "[B2] 홍보(PROSPECTS) 캠페인은 B2 대상이 아닙니다." };
  }
  if (!campaign.target_all || (campaign.target_tags ?? []).length > 0) {
    return { ok: false, error: "[B2] 태그 타깃 캠페인은 B2 대상이 아닙니다 (전체 구독자 캠페인만 허용)." };
  }
  return { ok: true };
}

// The requested id must be RESEND_TEST_SEGMENT_ID, and the real segment id
// must be set too, so "differs from the real segment" is actually checked
// rather than passing because one side is empty.
export function resolveBroadcastTestSegment(
  target: BroadcastTestTarget,
  env: Env = process.env,
): { ok: true; segmentId: string } | { ok: false; error: string } {
  if (!env.RESEND_NEWSLETTER_SEGMENT_ID?.trim()) {
    return { ok: false, error: "[B2] RESEND_NEWSLETTER_SEGMENT_ID가 없어 운영 Segment와의 구분을 확인할 수 없습니다." };
  }
  const segment = resolveBroadcastSegment("test", env, target.segmentId);
  return segment.ok ? segment : { ok: false, error: `[B2] ${segment.error}` };
}

// Campaign shape + segment, no I/O. processCampaign runs this before the
// claim, so a rejected B2 run leaves the campaign untouched.
export function checkBroadcastTestRun(
  campaign: BroadcastTestCampaignShape,
  target: BroadcastTestTarget,
  env: Env = process.env,
): { ok: true; segmentId: string } | { ok: false; error: string } {
  const shape = checkBroadcastTestCampaign(campaign);
  if (!shape.ok) return shape;
  return resolveBroadcastTestSegment(target, env);
}

// After the segment-scoped preflight: the segment must hold 1..MAX subscribed
// Contacts. That count is also the run's recipient estimate.
export function checkBroadcastTestPreflight(preflight: PreflightResult): { ok: true; recipients: number } | { ok: false; error: string } {
  if (!preflight.ok) {
    return { ok: false, error: `[B2] preflight 차단: ${describePreflightIssues(preflight.blocking)}` };
  }
  if (preflight.segmentSubscribed === 0) {
    return { ok: false, error: "[B2] 테스트 Segment에 구독 중인 Contact가 없습니다." };
  }
  if (preflight.segmentSubscribed > BROADCAST_TEST_MAX_CONTACTS) {
    return {
      ok: false,
      error: `[B2] 테스트 Segment의 구독 Contact가 ${preflight.segmentSubscribed}명으로 상한(${BROADCAST_TEST_MAX_CONTACTS}명)을 넘습니다. 운영 Segment가 아닌지 확인하세요.`,
    };
  }
  return { ok: true, recipients: preflight.segmentSubscribed };
}

export function runBroadcastTestPreflight(
  db: SupabaseClient,
  client: PreflightClient,
  segmentId: string,
): Promise<PreflightResult> {
  return runBroadcastPreflight(db, client, segmentId, { scope: "segment_only" });
}

// ---------------------------------------------------------------------------
// Rows the B2 script inserts on --send
// ---------------------------------------------------------------------------

// DRAFT, unpublished, no issue number: never listed on the site and never
// part of the numbered series.
export function broadcastTestNewsletterRow(stamp: string) {
  return {
    title: `[B2 테스트] Broadcast 캠페인 경로 점검 ${stamp}`,
    slug: `b2-broadcast-test-${stamp}`,
    subject: "[B2 테스트] 검레터 Broadcast 경로 점검",
    preheader: "운영 발송이 아닌 B2 테스트 메일입니다.",
    status: "DRAFT",
    newsletter_type: "REGULAR",
    published_at: null,
    blocks: [
      { id: "b2-heading", order: 0, type: "heading", content: { text: "B2 테스트 메일", level: 2 } },
      {
        id: "b2-text",
        order: 1,
        type: "text",
        content: {
          html: "<p>검레터 Broadcast 캠페인 경로(processCampaign → Resend Broadcast) 점검용 메일입니다. 테스트 Segment에만 발송됩니다.</p>",
        },
      },
      { id: "b2-button", order: 2, type: "button", content: { text: "모즈나인 방문", url: "https://moz9.kr", style: "primary" } },
    ] satisfies ContentBlock[],
  };
}

export function broadcastTestCampaignRow(newsletterId: string, stamp: string) {
  return {
    newsletter_id: newsletterId,
    name: `[B2 TEST] Broadcast campaign path ${stamp}`,
    send_type: "SCHEDULED",
    scheduled_at: BROADCAST_TEST_SCHEDULED_AT,
    target_all: true,
    target_tags: [] as string[],
    audience: "SUBSCRIBERS",
    status: "SCHEDULED",
  };
}

// ---------------------------------------------------------------------------
// Read-only plan (the script's dry-run, and its re-check right before --send)
// ---------------------------------------------------------------------------

export type BroadcastTestPlanContact = { contactId: string; maskedEmail: string; unsubscribed: boolean };

export type BroadcastTestPlan = {
  ok: boolean;
  errors: string[];
  segmentId: string | null;
  operatingSegmentId: string | null;
  contacts: BroadcastTestPlanContact[];
  preflight: PreflightResult | null;
  sendingCampaigns: number;
  deliveryPath: "broadcast" | null;
  expectedRecipients: number | null;
};

export type BroadcastTestPlanDb = Pick<SupabaseClient, "from">;

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${(domain ?? "").slice(0, 2)}***`;
}

// Reads only: Supabase selects, Resend segment contacts and suppression list.
// Every check processCampaign({ broadcastTest }) will make, plus "no campaign
// is SENDING", reported together rather than stopping at the first.
export async function planBroadcastTestRun(
  db: BroadcastTestPlanDb,
  client: PreflightClient,
  target: BroadcastTestTarget,
  env: Env = process.env,
): Promise<BroadcastTestPlan> {
  const plan: BroadcastTestPlan = {
    ok: false,
    errors: [],
    segmentId: null,
    operatingSegmentId: env.RESEND_NEWSLETTER_SEGMENT_ID?.trim() || null,
    contacts: [],
    preflight: null,
    sendingCampaigns: 0,
    deliveryPath: null,
    expectedRecipients: null,
  };

  const run = checkBroadcastTestRun(broadcastTestCampaignRow("plan", "plan"), target, env);
  if (!run.ok) {
    plan.errors.push(run.error);
    return plan;
  }
  plan.segmentId = run.segmentId;
  plan.deliveryPath = "broadcast";

  try {
    const contacts = await listSegmentContacts(client, run.segmentId);
    plan.contacts = contacts.map((c) => ({ contactId: c.id, maskedEmail: maskEmail(c.email), unsubscribed: c.unsubscribed }));
  } catch (err) {
    plan.errors.push(`[B2] 테스트 Segment 조회 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  plan.preflight = await runBroadcastTestPreflight(db as SupabaseClient, client, run.segmentId);
  const audience = checkBroadcastTestPreflight(plan.preflight);
  if (audience.ok) plan.expectedRecipients = audience.recipients;
  else plan.errors.push(audience.error);

  const { data, error } = await db.from("newsletter_campaigns").select("id").eq("status", "SENDING");
  if (error) plan.errors.push(`[B2] 캠페인 상태 조회 실패: ${error.message}`);
  plan.sendingCampaigns = (data ?? []).length;
  if (plan.sendingCampaigns > 0) plan.errors.push(`[B2] 발송 중(SENDING)인 캠페인이 ${plan.sendingCampaigns}개 있습니다.`);

  plan.ok = plan.errors.length === 0;
  return plan;
}
