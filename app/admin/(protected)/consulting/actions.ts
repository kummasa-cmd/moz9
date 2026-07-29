"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySubmitterReply } from "@/lib/mail";

export async function replyConsultation(id: string, formData: FormData) {
  const answer = String(formData.get("answer") ?? "").trim();
  const page = String(formData.get("page") ?? "1");
  const limit = String(formData.get("limit") ?? "10");

  if (!answer) {
    redirect(`/admin/consulting?id=${id}&page=${page}&limit=${limit}&error=답변 내용을 입력해 주세요.`);
  }

  const supabase = createAdminClient();
  const { data: consultation } = await supabase
    .from("consultations")
    .select("subject, email, member_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("consultations")
    .update({ admin_reply: answer, status: "답변완료" })
    .eq("id", id);

  if (error) {
    redirect(`/admin/consulting?id=${id}&page=${page}&limit=${limit}&error=${encodeURIComponent(error.message)}`);
  }

  if (consultation?.email) {
    await notifySubmitterReply({
      boardLabel: "상담 게시판",
      title: consultation.subject,
      toEmail: consultation.email,
      reply: answer,
      ctaPath: consultation.member_id ? `/mypage/consultations/${id}` : undefined,
    });
  }

  revalidatePath("/admin/consulting");
  revalidatePath("/mypage/consultations");
  redirect(`/admin/consulting?id=${id}&page=${page}&limit=${limit}`);
}
