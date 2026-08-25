"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { processCampaign } from "@/lib/newsletter/scheduler";

export async function deleteNewsletter(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletters").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
  revalidatePath("/newsletter");
}

export async function deleteNewsletters(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletters").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
  revalidatePath("/newsletter");
}

export async function cancelCampaign(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletter_campaigns").update({ status: "CANCELLED" }).eq("id", id);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
}

export async function sendCampaignNow(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await processCampaign(id);

  revalidatePath("/admin/site/newsletter/list");
  revalidatePath("/admin/site/newsletter/promo/list");
}
