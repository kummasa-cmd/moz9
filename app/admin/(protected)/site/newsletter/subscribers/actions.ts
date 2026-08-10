"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function addSubscriber(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;

  if (!email) {
    redirect("/admin/site/newsletter/subscribers?error=이메일을 입력해 주세요.");
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("newsletter_subscribers").insert({
    email,
    name,
    source: "MANUAL",
  });

  if (error) {
    const message = error.code === "23505" ? "이미 등록된 이메일입니다." : error.message;
    redirect(`/admin/site/newsletter/subscribers?error=${encodeURIComponent(message)}`);
  }

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

export async function setSubscriberStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !status) return;

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "UNSUBSCRIBED") patch.unsubscribed_at = new Date().toISOString();
  if (status === "SUBSCRIBED") patch.unsubscribed_at = null;

  await supabase.from("newsletter_subscribers").update(patch).eq("id", id);
  revalidatePath("/admin/site/newsletter/subscribers");
}

export async function deleteSubscriber(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("newsletter_subscribers").delete().eq("id", id);

  revalidatePath("/admin/site/newsletter/subscribers");
}

export async function deleteSubscribers(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();
  await supabase.from("newsletter_subscribers").delete().in("id", ids);

  revalidatePath("/admin/site/newsletter/subscribers");
}
