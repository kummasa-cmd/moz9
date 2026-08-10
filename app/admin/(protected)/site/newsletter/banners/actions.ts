"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

function bannerFields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    image_url: String(formData.get("image_url") ?? ""),
    link_url: String(formData.get("link_url") ?? ""),
    position: String(formData.get("position") ?? "MIDDLE"),
    start_date: String(formData.get("start_date") ?? ""),
    end_date: String(formData.get("end_date") ?? ""),
    is_active: formData.get("is_active") === "on",
  };
}

export async function createBanner(formData: FormData) {
  const fields = bannerFields(formData);

  if (!fields.image_url) {
    redirect("/admin/site/newsletter/banners/new?error=배너 이미지를 업로드해 주세요.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("newsletter_ad_banners").insert(fields);

  if (error) {
    redirect(`/admin/site/newsletter/banners/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/newsletter/banners");
  redirect("/admin/site/newsletter/banners");
}

export async function updateBanner(id: string, formData: FormData) {
  const fields = bannerFields(formData);

  if (!fields.image_url) {
    redirect(`/admin/site/newsletter/banners/${id}/edit?error=배너 이미지를 업로드해 주세요.`);
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("newsletter_ad_banners").update(fields).eq("id", id);

  if (error) {
    redirect(`/admin/site/newsletter/banners/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/newsletter/banners");
  redirect("/admin/site/newsletter/banners");
}

export async function deleteBanner(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletter_ad_banners").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/banners");
}

export async function deleteBanners(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletter_ad_banners").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/banners");
}
