"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaign } from "@/lib/newsletter/scheduler";
import { cancelScheduledCampaign } from "@/lib/newsletter/campaign-save";
import { requireAdmin } from "@/lib/admin-guard";

export async function deleteNewsletter(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletters").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
  revalidatePath("/newsletter");
}

export async function deleteNewsletters(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletters").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
  revalidatePath("/newsletter");
}

export async function cancelCampaign(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");

  // SCHEDULED only, enforced in the UPDATE itself — the button is shown only
  // for SCHEDULED campaigns, but the action can be called directly.
  const cancelled = await cancelScheduledCampaign(createAdminClient(), id);
  if (!cancelled) console.warn("[newsletter] cancel ignored, campaign is not SCHEDULED:", id);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
}

export async function sendCampaignNow(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await processCampaign(id, { trigger: "manual" });

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
}
