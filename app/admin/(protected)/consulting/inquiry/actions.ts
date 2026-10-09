"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-guard";

export async function replyInquiry(id: string, formData: FormData) {
  await requireAdmin();
  const answer = String(formData.get("answer") ?? "");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("inquiries")
    .update({ answer, status: "답변완료", answered_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/admin/consulting/inquiry?id=${id}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/consulting/inquiry");
  redirect(`/admin/consulting/inquiry?id=${id}`);
}
