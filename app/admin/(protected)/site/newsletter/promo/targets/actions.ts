"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addProspect(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!email) {
    redirect("/admin/site/newsletter/promo/targets?error=이메일을 입력해 주세요.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("newsletter_prospects").insert({
    email,
    name,
    source: "MANUAL",
  });

  if (error) {
    const message = error.code === "23505" ? "이미 등록된 이메일입니다." : error.message;
    redirect(`/admin/site/newsletter/promo/targets?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/site/newsletter/promo/targets");
  redirect("/admin/site/newsletter/promo/targets");
}

export async function bulkAddProspects(formData: FormData) {
  const raw = String(formData.get("emails") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    redirect("/admin/site/newsletter/promo/targets?error=등록할 이메일을 입력해 주세요.");
  }

  const rows = lines
    .map((line) => {
      const [emailPart, ...nameParts] = line.split(",");
      return {
        email: emailPart.trim().toLowerCase(),
        name: nameParts.join(",").trim() || null,
        source: "IMPORT" as const,
      };
    })
    .filter((row) => /^\S+@\S+\.\S+$/.test(row.email));

  if (rows.length === 0) {
    redirect("/admin/site/newsletter/promo/targets?error=유효한 이메일이 없습니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("newsletter_prospects")
    .upsert(rows, { onConflict: "email", ignoreDuplicates: true });

  if (error) {
    redirect(`/admin/site/newsletter/promo/targets?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/newsletter/promo/targets");
  redirect(`/admin/site/newsletter/promo/targets?imported=${rows.length}`);
}

export async function deleteProspect(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletter_prospects").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/promo/targets");
}

export async function deleteProspects(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletter_prospects").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/promo/targets");
}

// Deleting a suppression entry lifts the do-not-contact block — the email
// becomes eligible for both regular and promotional sends again. See
// lib/newsletter/queries.ts::getSuppressedEmailSet.
export async function deleteSuppression(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletter_suppressions").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/promo/targets");
}

export async function deleteSuppressions(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletter_suppressions").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/promo/targets");
}
