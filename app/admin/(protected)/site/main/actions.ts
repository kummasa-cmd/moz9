"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function updateSiteSettings(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("site_settings")
    .update({
      hero_title: String(formData.get("heroTitle") ?? ""),
      hero_subtitle: String(formData.get("heroSubtitle") ?? ""),
      cta_label: String(formData.get("ctaLabel") ?? ""),
      cta_href: String(formData.get("ctaHref") ?? ""),
      company_name: String(formData.get("companyName") ?? ""),
      biz_number: String(formData.get("bizNumber") ?? ""),
      address: String(formData.get("address") ?? ""),
      ceo: String(formData.get("ceo") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
    })
    .eq("id", 1);

  revalidatePath("/admin/site/main");

  if (error) {
    redirect(`/admin/site/main?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/site/main?saved=1");
}
