"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySubmitterReply } from "@/lib/mail";

export async function replyPartnerPost(id: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  const page = String(formData.get("page") ?? "1");
  const limit = String(formData.get("limit") ?? "10");

  if (!content) {
    redirect(`/admin/consulting/partner?id=${id}&page=${page}&limit=${limit}&error=답변 내용을 입력해 주세요.`);
  }

  const supabase = createAdminClient();

  const { data: post } = await supabase
    .from("partner_posts")
    .select("title, member_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("partner_post_comments").insert({
    post_id: id,
    author_name: "모즈나인",
    content,
    is_admin: true,
  });

  if (error) {
    redirect(`/admin/consulting/partner?id=${id}&page=${page}&limit=${limit}&error=${encodeURIComponent(error.message)}`);
  }

  await supabase
    .from("partner_posts")
    .update({ status: "답변완료", processed_at: new Date().toISOString() })
    .eq("id", id);

  if (post) {
    const { data: member } = await supabase
      .from("members")
      .select("email")
      .eq("user_id", post.member_id)
      .maybeSingle();

    if (member?.email) {
      await notifySubmitterReply({
        boardLabel: "거래처 게시판",
        title: post.title,
        toEmail: member.email,
        reply: content,
        ctaPath: `/mypage/partner/${id}`,
      });
    }
  }

  revalidatePath("/admin/consulting/partner");
  revalidatePath(`/mypage/partner/${id}`);
  redirect(`/admin/consulting/partner?id=${id}&page=${page}&limit=${limit}`);
}
