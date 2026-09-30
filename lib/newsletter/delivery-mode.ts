// Delivery mode selection for the regular newsletter (3단계).
//
//   NEWSLETTER_DELIVERY_MODE=legacy     → resend.batch.send() (scheduler.ts, unchanged)
//   NEWSLETTER_DELIVERY_MODE=broadcast  → Resend Broadcast (broadcast-sender.ts)
//
// Anything else — unset, empty, a typo — resolves to legacy, so the send
// path can only change when someone sets exactly "broadcast". Pure (env is
// passed in) so the fallback rules are unit-tested.

export type DeliveryMode = "legacy" | "broadcast";

type Env = Record<string, string | undefined>;

export function resolveDeliveryMode(env: Env = process.env): DeliveryMode {
  return env.NEWSLETTER_DELIVERY_MODE?.trim().toLowerCase() === "broadcast" ? "broadcast" : "legacy";
}

export type CampaignDeliveryPath =
  | { path: "legacy"; reason: "mode_legacy" | "promotional" | "tag_targeted" }
  | { path: "broadcast" };

// Even in broadcast mode some campaigns stay on the legacy path:
//   - promotional (PROSPECTS) campaigns — prospects are not Resend Contacts and
//     are out of scope for the Broadcast migration;
//   - tag-targeted campaigns — the first Broadcast version only sends to the
//     whole SUBSCRIBED segment, it has no per-tag segments.
export function selectCampaignDeliveryPath(input: {
  mode: DeliveryMode;
  audience: string;
  targetAll: boolean;
  targetTags: string[] | null;
}): CampaignDeliveryPath {
  if (input.mode !== "broadcast") return { path: "legacy", reason: "mode_legacy" };
  if (input.audience !== "SUBSCRIBERS") return { path: "legacy", reason: "promotional" };
  if (!input.targetAll && (input.targetTags ?? []).length > 0) return { path: "legacy", reason: "tag_targeted" };
  return { path: "broadcast" };
}

export type SegmentPurpose = "campaign" | "test";

export type SegmentGuardResult = { ok: true; segmentId: string } | { ok: false; error: string };

// Keeps the real subscriber segment and the test segment from ever being
// swapped:
//   - "campaign" (a real scheduled/manual campaign) may only target
//     RESEND_NEWSLETTER_SEGMENT_ID, and never when it equals the test segment.
//   - "test" (manual test script) may only target RESEND_TEST_SEGMENT_ID, and
//     never when it equals the real segment. The caller must also name the
//     segment explicitly, and it has to match the env value.
export function resolveBroadcastSegment(
  purpose: SegmentPurpose,
  env: Env = process.env,
  requestedSegmentId?: string | null,
): SegmentGuardResult {
  const production = env.RESEND_NEWSLETTER_SEGMENT_ID?.trim() || null;
  const test = env.RESEND_TEST_SEGMENT_ID?.trim() || null;
  const requested = requestedSegmentId?.trim() || null;

  if (production && test && production === test) {
    return { ok: false, error: "RESEND_TEST_SEGMENT_ID와 RESEND_NEWSLETTER_SEGMENT_ID가 같습니다." };
  }

  if (purpose === "campaign") {
    if (!production) return { ok: false, error: "RESEND_NEWSLETTER_SEGMENT_ID가 설정되지 않았습니다." };
    if (requested && requested !== production) {
      return { ok: false, error: "캠페인 발송은 검레터 구독자 Segment로만 할 수 있습니다." };
    }
    return { ok: true, segmentId: production };
  }

  if (!test) return { ok: false, error: "RESEND_TEST_SEGMENT_ID가 설정되지 않았습니다." };
  if (!requested) return { ok: false, error: "테스트 Segment ID를 명시적으로 지정해야 합니다." };
  if (requested === production) {
    return { ok: false, error: "테스트 발송에 검레터 구독자 Segment를 사용할 수 없습니다." };
  }
  if (requested !== test) {
    return { ok: false, error: "지정한 Segment가 RESEND_TEST_SEGMENT_ID와 다릅니다." };
  }
  return { ok: true, segmentId: test };
}
