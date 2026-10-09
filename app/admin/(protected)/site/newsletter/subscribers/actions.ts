"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminSetSubscriberStatus, isAdminStatus } from "@/lib/newsletter/admin-status";
import { syncSubscriberContact, unsubscribeDeletedContacts } from "@/lib/newsletter/contact-sync";
import { requireAdmin } from "@/lib/admin-guard";

export async function addSubscriber(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!email) {
    redirect("/admin/site/newsletter/subscribers?error=이메일을 입력해 주세요.");
  }

  const supabase = createAdminClient();
  const { data: inserted, error } = await supabase
    .from("newsletter_subscribers")
    .insert({
      email,
      name,
      source: "MANUAL",
    })
    .select("id")
    .single();

  if (error) {
    const message = error.code === "23505" ? "이미 등록된 이메일입니다." : error.message;
    redirect(`/admin/site/newsletter/subscribers?error=${encodeURIComponent(message)}`);
  }

  // Bulk imports are left to the retry job / backfill (rate limit); a single
  // manual add is synced right away.
  after(() => syncSubscriberContact(inserted.id as string));

  revalidatePath("/admin/site/newsletter/subscribers");
  redirect("/admin/site/newsletter/subscribers");
}

export async function bulkAddSubscribers(formData: FormData) {
  await requireAdmin();
  const raw = String(formData.get("emails") ?? "");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    redirect("/admin/site/newsletter/subscribers?error=등록할 이메일을 입력해 주세요.");
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
    redirect("/admin/site/newsletter/subscribers?error=유효한 이메일이 없습니다.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("newsletter_subscribers")
    .upsert(rows, { onConflict: "email", ignoreDuplicates: true });

  if (error) {
    redirect(`/admin/site/newsletter/subscribers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/newsletter/subscribers");
  redirect(`/admin/site/newsletter/subscribers?imported=${rows.length}`);
}

// Mirrors the website's (re)subscribe / unsubscribe behavior so an admin
// status change and a subscriber's own action end in the same state:
//   SUBSCRIBED   → lift an UNSUBSCRIBE entry, Resend Contact unsubscribed=false
//   UNSUBSCRIBED → add the do-not-contact entry, Resend Contact unsubscribed=true
// Bounced / complained / Resend-suppressed subscribers are refused (see
// lib/newsletter/admin-status.ts). Supabase is written first (one SQL
// function call); the Resend sync runs afterwards and a failure there is
// only recorded on the row (resend_sync_error) for retry.
export async function setSubscriberStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !isAdminStatus(status)) return;

  const result = await adminSetSubscriberStatus(createAdminClient(), id, status);
  if (!result.ok) {
    console.error("[newsletter] 구독자 상태 변경 거부/실패:", id, result.outcome);
    revalidatePath("/admin/site/newsletter/subscribers");
    redirect(`/admin/site/newsletter/subscribers?error=${encodeURIComponent(result.message)}`);
  }

  if (result.outcome === "updated") after(() => syncSubscriberContact(id));
  revalidatePath("/admin/site/newsletter/subscribers");
}

export async function deleteSubscriber(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  const { data: deleted } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", id)
    .select("email, resend_contact_id");

  // The row is gone, so opt the Resend Contact out (best effort) — otherwise
  // a later Broadcast could still reach it.
  after(() => unsubscribeDeletedContacts(deleted ?? []));

  revalidatePath("/admin/site/newsletter/subscribers");
}

export async function deleteSubscribers(formData: FormData) {
  await requireAdmin();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  const { data: deleted } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .in("id", ids)
    .select("email, resend_contact_id");

  after(() => unsubscribeDeletedContacts(deleted ?? []));

  revalidatePath("/admin/site/newsletter/subscribers");
}
