import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveBroadcastSegment, resolveDeliveryMode, selectCampaignDeliveryPath } from "./delivery-mode";
import { broadcastRunKey, decideExistingBroadcastRun } from "./broadcast-run";

describe("resolveDeliveryMode", () => {
  it("defaults to legacy when unset or empty", () => {
    assert.equal(resolveDeliveryMode({}), "legacy");
    assert.equal(resolveDeliveryMode({ NEWSLETTER_DELIVERY_MODE: "" }), "legacy");
    assert.equal(resolveDeliveryMode({ NEWSLETTER_DELIVERY_MODE: "   " }), "legacy");
  });

  it("falls back to legacy for invalid values", () => {
    for (const value of ["broadcasts", "bcast", "true", "1", "resend", "broadcast;legacy", "legacy "]) {
      assert.equal(resolveDeliveryMode({ NEWSLETTER_DELIVERY_MODE: value }), "legacy", value);
    }
  });

  it("returns broadcast only for 'broadcast' (trimmed, case-insensitive)", () => {
    assert.equal(resolveDeliveryMode({ NEWSLETTER_DELIVERY_MODE: "broadcast" }), "broadcast");
    assert.equal(resolveDeliveryMode({ NEWSLETTER_DELIVERY_MODE: " Broadcast\n" }), "broadcast");
  });

  it("reads process.env by default and is legacy in this test run", () => {
    const saved = process.env.NEWSLETTER_DELIVERY_MODE;
    delete process.env.NEWSLETTER_DELIVERY_MODE;
    try {
      assert.equal(resolveDeliveryMode(), "legacy");
    } finally {
      if (saved !== undefined) process.env.NEWSLETTER_DELIVERY_MODE = saved;
    }
  });
});

describe("selectCampaignDeliveryPath", () => {
  const base = { audience: "SUBSCRIBERS", targetAll: true, targetTags: [] as string[] };

  it("legacy mode always uses the legacy path", () => {
    assert.deepEqual(selectCampaignDeliveryPath({ ...base, mode: "legacy" }), { path: "legacy", reason: "mode_legacy" });
  });

  it("broadcast mode sends regular all-subscriber campaigns as a Broadcast", () => {
    assert.deepEqual(selectCampaignDeliveryPath({ ...base, mode: "broadcast" }), { path: "broadcast" });
  });

  it("keeps promotional (prospect) campaigns on legacy even in broadcast mode", () => {
    assert.deepEqual(selectCampaignDeliveryPath({ ...base, mode: "broadcast", audience: "PROSPECTS" }), {
      path: "legacy",
      reason: "promotional",
    });
  });

  it("keeps tag-targeted campaigns on legacy", () => {
    assert.deepEqual(
      selectCampaignDeliveryPath({ ...base, mode: "broadcast", targetAll: false, targetTags: ["vip"] }),
      { path: "legacy", reason: "tag_targeted" },
    );
    // target_all=false with no tags sends to everyone on legacy too.
    assert.deepEqual(
      selectCampaignDeliveryPath({ ...base, mode: "broadcast", targetAll: false, targetTags: null }),
      { path: "broadcast" },
    );
  });
});

describe("resolveBroadcastSegment", () => {
  const env = { RESEND_NEWSLETTER_SEGMENT_ID: "seg_prod", RESEND_TEST_SEGMENT_ID: "seg_test" };

  it("campaigns use the production segment", () => {
    assert.deepEqual(resolveBroadcastSegment("campaign", env), { ok: true, segmentId: "seg_prod" });
  });

  it("campaigns can never be pointed at the test segment", () => {
    const result = resolveBroadcastSegment("campaign", env, "seg_test");
    assert.equal(result.ok, false);
  });

  it("campaigns fail without a production segment", () => {
    assert.equal(resolveBroadcastSegment("campaign", { RESEND_TEST_SEGMENT_ID: "seg_test" }).ok, false);
  });

  it("tests require the explicitly named test segment", () => {
    assert.deepEqual(resolveBroadcastSegment("test", env, "seg_test"), { ok: true, segmentId: "seg_test" });
    assert.equal(resolveBroadcastSegment("test", env).ok, false);
    assert.equal(resolveBroadcastSegment("test", env, "seg_other").ok, false);
  });

  it("tests can never target the production segment", () => {
    const result = resolveBroadcastSegment("test", env, "seg_prod");
    assert.equal(result.ok, false);
  });

  it("tests fail when no test segment is configured", () => {
    assert.equal(resolveBroadcastSegment("test", { RESEND_NEWSLETTER_SEGMENT_ID: "seg_prod" }, "seg_prod").ok, false);
  });

  it("refuses everything when both env values are the same segment", () => {
    const same = { RESEND_NEWSLETTER_SEGMENT_ID: "seg_x", RESEND_TEST_SEGMENT_ID: " seg_x " };
    assert.equal(resolveBroadcastSegment("campaign", same).ok, false);
    assert.equal(resolveBroadcastSegment("test", same, "seg_x").ok, false);
  });
});

describe("broadcastRunKey", () => {
  // 2026-09-30 23:30 UTC = 2026-10-01 08:30 KST
  const now = new Date("2026-09-30T23:30:00Z");

  it("one-shot campaigns get a single run", () => {
    assert.equal(broadcastRunKey("IMMEDIATE", now), "once");
    assert.equal(broadcastRunKey("SCHEDULED", now), "once");
  });

  it("daily campaigns get one run per KST day", () => {
    assert.equal(broadcastRunKey("RECURRING", now), "2026-10-01");
    assert.equal(broadcastRunKey("RANGE", now), "2026-10-01");
  });
});

describe("decideExistingBroadcastRun", () => {
  it("reuses only a failed run that never got a broadcast id", () => {
    assert.equal(decideExistingBroadcastRun({ status: "FAILED", resend_broadcast_id: null }), "reuse");
  });

  it("refuses anything that may already have been sent or is in flight", () => {
    assert.equal(decideExistingBroadcastRun({ status: "FAILED", resend_broadcast_id: "b_1" }), "refuse");
    assert.equal(decideExistingBroadcastRun({ status: "CREATING", resend_broadcast_id: null }), "refuse");
    assert.equal(decideExistingBroadcastRun({ status: "DRAFT", resend_broadcast_id: "b_1" }), "refuse");
    assert.equal(decideExistingBroadcastRun({ status: "SEND_REQUESTED", resend_broadcast_id: "b_1" }), "refuse");
  });
});
