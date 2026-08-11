"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySubmitterReply } from "@/lib/mail";
import { PARTNER_POST_STATUSES } from "./types";

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
    .update({ status: "작업완료", processed_at: new Date().toISOString() })
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

export async function updatePartnerPostStatus(id: string, formData: FormData) {
  const status = String(formData.get("status") ?? "");
  const page = String(formData.get("page") ?? "1");
  const limit = String(formData.get("limit") ?? "10");

  if (!PARTNER_POST_STATUSES.includes(status as (typeof PARTNER_POST_STATUSES)[number])) {
    redirect(`/admin/consulting/partner?id=${id}&page=${page}&limit=${limit}&error=잘못된 상태입니다.`);
  }

  const supabase = createAdminClient();

  await supabase.from("partner_posts").update({ status, processed_at: new Date().toISOString() }).eq("id", id);

  revalidatePath("/admin/consulting/partner");
  revalidatePath(`/mypage/partner/${id}`);
  redirect(`/admin/consulting/partner?id=${id}&page=${page}&limit=${limit}`);
}

export async function updatePartnerComment(commentId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  const page = String(formData.get("page") ?? "1");
  const limit = String(formData.get("limit") ?? "10");

  const supabase = createAdminClient();

  const { data: comment } = await supabase
    .from("partner_post_comments")
    .select("post_id, is_admin")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) redirect("/admin/consulting/partner");

  if (!content) {
    redirect(`/admin/consulting/partner?id=${comment.post_id}&page=${page}&limit=${limit}&error=답변 내용을 입력해 주세요.`);
  }

  if (!comment.is_admin) {
    redirect(`/admin/consulting/partner?id=${comment.post_id}&page=${page}&limit=${limit}&error=사용자 답글은 수정할 수 없습니다.`);
  }

  await supabase.from("partner_post_comments").update({ content }).eq("id", commentId);

  revalidatePath("/admin/consulting/partner");
  revalidatePath(`/mypage/partner/${comment.post_id}`);
  redirect(`/admin/consulting/partner?id=${comment.post_id}&page=${page}&limit=${limit}`);
}

export async function deletePartnerComment(formData: FormData) {
  const commentId = String(formData.get("comment_id") ?? "");
  const page = String(formData.get("page") ?? "1");
  const limit = String(formData.get("limit") ?? "10");

  const supabase = createAdminClient();

  const { data: comment } = await supabase
    .from("partner_post_comments")
    .select("post_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) redirect("/admin/consulting/partner");

  await supabase.from("partner_post_comments").delete().eq("id", commentId);

  revalidatePath("/admin/consulting/partner");
  revalidatePath(`/mypage/partner/${comment.post_id}`);
  redirect(`/admin/consulting/partner?id=${comment.post_id}&page=${page}&limit=${limit}`);
}
