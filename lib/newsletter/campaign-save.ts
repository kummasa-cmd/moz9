// Saving the "발송 예약 설정" part of the admin newsletter edit form.
//
// The edit form re-submits the campaign settings on every save, including
// for campaigns that already went out. Before this guard the save reset the
// campaign to SCHEDULED unconditionally, so re-saving a sent newsletter (even
// just to fix a typo) brought the campaign back to life: an IMMEDIATE
// campaign was sent again on the spot, a SCHEDULED one at the next cron run.
// The legacy send path has no other duplicate-send guard, so this module is
// the last line of defence and must run on the server, not only in the UI.
//
// Kept free of DB / Next.js imports (the store is injected) so the rules are
// unit-tested.

import type { SupabaseClient } from "@supabase/supabase-js";

// The campaign went out (SENT / PARTIAL) or is going out right now (SENDING):
// its send settings are frozen.
export const LOCKED_CAMPAIGN_STATUSES: ReadonlySet<string> = new Set(["SENT", "PARTIAL", "SENDING"]);

// One-shot campaigns reach each recipient once. RECURRING / RANGE send daily
// by design, so pausing (CANCELLED) and resuming them stays allowed.
const ONE_SHOT_SEND_TYPES: ReadonlySet<string> = new Set(["IMMEDIATE", "SCHEDULED"]);

export type ExistingCampaign = {
  id: string;
  newsletter_id: string;
  status: string;
  send_type: string;
  scheduled_at: string | null;
};

// Why the campaign's send settings can't be changed, or null if they can.
//
// FAILED / CANCELLED stay re-schedulable — that's how a failed send is retried
// and a cancelled one re-booked — unless a one-shot campaign already reached
// someone: FAILED is also what a run that threw midway ends as, and a SENT
// campaign could have been cancelled afterwards.
export function campaignScheduleLockReason(campaign: {
  status: string;
  send_type: string;
  hasDelivered: boolean;
}): string | null {
  if (LOCKED_CAMPAIGN_STATUSES.has(campaign.status)) {
    return "발송이 끝났거나 발송 중인 캠페인은 발송 설정을 바꿀 수 없습니다.";
  }
  if (
    (campaign.status === "FAILED" || campaign.status === "CANCELLED") &&
    ONE_SHOT_SEND_TYPES.has(campaign.send_type) &&
    campaign.hasDelivered
  ) {
    return "이미 일부 수신자에게 발송된 캠페인은 다시 예약할 수 없습니다.";
  }
  return null;
}

export type CampaignScheduleFields = {
  newsletter_id: string;
  name: string;
  send_type: string;
  scheduled_at: string | null;
  recurring_time: string | null;
  range_start: string | null;
  range_end: string | null;
  target_all: boolean;
  target_tags: string[];
  // Set by the promotional editor (always PROSPECTS); the regular editor
  // leaves it to the column default.
  audience?: "SUBSCRIBERS" | "PROSPECTS";
};

// The original booking survives a switch to another send type (e.g. a
// SCHEDULED campaign the admin sends right away as IMMEDIATE), so the DB can
// later compare scheduled_at (booked) / sending_started_at (claimed) /
// sent_at (finished). Only an explicit new date replaces it. Due checks for
// IMMEDIATE / RECURRING / RANGE never read scheduled_at.
export function mergeScheduleFields(
  fields: CampaignScheduleFields,
  existing: Pick<ExistingCampaign, "scheduled_at"> | null,
): CampaignScheduleFields {
  return { ...fields, scheduled_at: fields.scheduled_at ?? existing?.scheduled_at ?? null };
}

export type CampaignSaveStore = {
  loadCampaign(id: string): Promise<ExistingCampaign | null>;
  // Latest campaign of the newsletter — used when the form carries no
  // campaign id, so a stale form can't create a second campaign next to a
  // sent one.
  loadLatestCampaign(newsletterId: string): Promise<ExistingCampaign | null>;
  // Whether any recipient of this campaign was actually sent to.
  hasDelivered(campaignId: string): Promise<boolean>;
  // Sets the fields and status SCHEDULED only while the status is still
  // `expectedStatus`; false when it changed in between (e.g. a cron claim).
  updateIfStatus(id: string, fields: CampaignScheduleFields, expectedStatus: string): Promise<boolean>;
  insert(fields: CampaignScheduleFields): Promise<string>;
};

// Result of processCampaign() — kept structural so this module doesn't
// import the scheduler (and with it the DB / Resend clients).
export type SendNowResult = { ok: boolean; error?: string };

export type CampaignSaveResult =
  // sendResult is set when an IMMEDIATE campaign was sent right after saving.
  | { kind: "saved"; campaignId: string; sendResult: SendNowResult | null }
  | { kind: "locked"; campaignId: string; reason: string }
  | { kind: "conflict"; campaignId: string };

// The only way the edit form sends a campaign: sendNow runs exactly when the
// save itself went through for an IMMEDIATE campaign — never for a locked or
// conflicting one.
export async function saveCampaignSchedule(
  store: CampaignSaveStore,
  input: { existingCampaignId: string | null; fields: CampaignScheduleFields },
  sendNow: (campaignId: string) => Promise<SendNowResult>,
): Promise<CampaignSaveResult> {
  const { fields } = input;

  let existing = input.existingCampaignId ? await store.loadCampaign(input.existingCampaignId) : null;
  // A campaign id from another newsletter (tampered / stale form) is ignored.
  if (existing && existing.newsletter_id !== fields.newsletter_id) existing = null;
  if (!existing) existing = await store.loadLatestCampaign(fields.newsletter_id);

  if (!existing) {
    const campaignId = await store.insert(mergeScheduleFields(fields, null));
    return { kind: "saved", campaignId, sendResult: await maybeSend(fields, campaignId, sendNow) };
  }

  const reason = campaignScheduleLockReason({
    status: existing.status,
    send_type: existing.send_type,
    hasDelivered: LOCKED_CAMPAIGN_STATUSES.has(existing.status) ? true : await store.hasDelivered(existing.id),
  });
  if (reason) return { kind: "locked", campaignId: existing.id, reason };

  const updated = await store.updateIfStatus(existing.id, mergeScheduleFields(fields, existing), existing.status);
  if (!updated) return { kind: "conflict", campaignId: existing.id };

  return { kind: "saved", campaignId: existing.id, sendResult: await maybeSend(fields, existing.id, sendNow) };
}

async function maybeSend(
  fields: CampaignScheduleFields,
  campaignId: string,
  sendNow: (campaignId: string) => Promise<SendNowResult>,
): Promise<SendNowResult | null> {
  return fields.send_type === "IMMEDIATE" ? sendNow(campaignId) : null;
}

// ---------------------------------------------------------------------------
// Supabase-backed store
// ---------------------------------------------------------------------------

const CAMPAIGN_COLUMNS = "id, newsletter_id, status, send_type, scheduled_at";

export function createCampaignSaveStore(db: SupabaseClient): CampaignSaveStore {
  return {
    async loadCampaign(id) {
      const { data, error } = await db.from("newsletter_campaigns").select(CAMPAIGN_COLUMNS).eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ExistingCampaign | null) ?? null;
    },
    async loadLatestCampaign(newsletterId) {
      const { data, error } = await db
        .from("newsletter_campaigns")
        .select(CAMPAIGN_COLUMNS)
        .eq("newsletter_id", newsletterId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as ExistingCampaign | null) ?? null;
    },
    async hasDelivered(campaignId) {
      // Anything but FAILED counts: a QUEUED row left by a run that stopped
      // midway may still have been accepted by Resend.
      const { count, error } = await db
        .from("newsletter_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .neq("status", "FAILED");
      if (error) throw new Error(error.message);
      return (count ?? 0) > 0;
    },
    async updateIfStatus(id, fields, expectedStatus) {
      const { data, error } = await db
        .from("newsletter_campaigns")
        .update({ ...fields, status: "SCHEDULED" })
        .eq("id", id)
        .eq("status", expectedStatus)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data !== null;
    },
    async insert(fields) {
      const { data, error } = await db
        .from("newsletter_campaigns")
        .insert({ ...fields, status: "SCHEDULED" })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "캠페인을 만들지 못했습니다.");
      return data.id as string;
    },
  };
}

// The list's "발송 취소" button. Only a campaign that is still waiting
// (SCHEDULED) can be cancelled: cancelling a SENT one would relabel a sent
// campaign, and cancelling a SENDING one would race the run in progress.
// Returns whether a campaign was cancelled.
export async function cancelScheduledCampaign(db: SupabaseClient, campaignId: string): Promise<boolean> {
  const { data, error } = await db
    .from("newsletter_campaigns")
    .update({ status: "CANCELLED" })
    .eq("id", campaignId)
    .eq("status", "SCHEDULED")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data !== null;
}
