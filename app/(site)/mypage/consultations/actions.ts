"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createConsultation(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!subject || !message) {
    redirect("/mypage/consultations/new?error=제목과 내용을 입력해 주세요.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/consultations/new");

  const { error } = await supabase.from("consultations").insert({
    member_id: user.id,
    subject,
    message,
  });

  if (error) {
    redirect(`/mypage/consultations/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/mypage/consultations");
  revalidatePath("/mypage");
  redirect("/mypage/consultations");
}
