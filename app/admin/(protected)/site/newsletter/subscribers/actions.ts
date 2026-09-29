"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addToSuppressionList, removeFromSuppressionList } from "@/lib/newsletter/queries";
import { syncSubscriberContact, unsubscribeDeletedContacts } from "@/lib/newsletter/contact-sync";
import type { SubscriberStatus } from "@/lib/newsletter/types";

const SUBSCRIBER_STATUSES: SubscriberStatus[] = ["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED"];

export async function addSubscriber(formData: FormData) {
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
//   SUBSCRIBED   → lift the do-not-contact entry, Resend Contact unsubscribed=false
//   UNSUBSCRIBED → add the do-not-contact entry,  Resend Contact unsubscribed=true
// Supabase is written first; the Resend sync runs afterwards and a failure
// there is only recorded on the row (resend_sync_error) for retry.
export async function setSubscriberStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as SubscriberStatus;
  if (!id || !SUBSCRIBER_STATUSES.includes(status)) return;

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {
    status,
    // Marks the Resend Contact stale until the follow-up sync succeeds.
    resend_synced_at: null,
  };
  if (status === "UNSUBSCRIBED") patch.unsubscribed_at = new Date().toISOString();
  if (status === "SUBSCRIBED") patch.unsubscribed_at = null;

  const { data: updated, error } = await supabase
    .from("newsletter_subscribers")
    .update(patch)
    .eq("id", id)
    .select("email")
    .maybeSingle();

  if (error || !updated) {
    if (error) console.error("[newsletter] 구독자 상태 변경 실패:", id, error.message);
    revalidatePath("/admin/site/newsletter/subscribers");
    return;
  }

  const email = updated.email as string;
  if (status === "SUBSCRIBED") {
    const { error: suppressionError } = await removeFromSuppressionList(email);
    if (suppressionError) {
      console.error("[newsletter] 수신거부 목록 제거 실패:", email, suppressionError.message);
    }
  } else if (status === "UNSUBSCRIBED") {
    await addToSuppressionList(email);
  }

  after(() => syncSubscriberContact(id));
  revalidatePath("/admin/site/newsletter/subscribers");
}

export async function deleteSubscriber(formData: FormData) {
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
