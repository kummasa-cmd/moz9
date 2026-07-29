"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminNewSubmission } from "@/lib/mail";

export async function createConsultation(formData: FormData) {
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  if (!subject || !message) {
    redirect("/mypage/consultations/new?error=제목과 내용을 입력해 주세요.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/consultations/new");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("name")
    .eq("user_id", user.id)
    .maybeSingle();

  const authorName = member?.name ?? user.email ?? "마이페이지 회원";

  const { error } = await admin.from("consultations").insert({
    member_id: user.id,
    name: authorName,
    email: user.email,
    subject,
    message,
    channel: "마이페이지",
  });

  if (error) {
    redirect(`/mypage/consultations/new?error=${encodeURIComponent(error.message)}`);
  }

  await notifyAdminNewSubmission(admin, {
    boardLabel: "상담 게시판",
    title: subject,
    authorName,
    authorEmail: user.email ?? "",
    preview: message,
    ctaPath: "/admin/consulting",
  });

  revalidatePath("/mypage/consultations");
  revalidatePath("/mypage");
  redirect("/mypage/consultations");
}
