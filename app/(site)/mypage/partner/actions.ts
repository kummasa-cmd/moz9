"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdminNewSubmission, stripHtmlPreview } from "@/lib/mail";

const ATTACHMENT_BUCKET = "member-files";
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "hwp",
  "zip", "txt", "csv", "jpg", "jpeg", "png", "gif", "webp",
];

export async function createPartnerPost(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const file = formData.get("attachment");

  if (!title || !content) {
    redirect("/mypage/partner/new?error=제목과 내용을 입력해 주세요.");
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/partner/new");

  const admin = createAdminClient();
  const { data: member } = await admin
    .from("members")
    .select("is_partner, partner_name, nickname, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!member?.is_partner) redirect("/mypage");

  let attachment_url: string | null = null;
  let attachment_name: string | null = null;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      redirect("/mypage/partner/new?error=첨부파일 크기는 10MB 이하여야 합니다.");
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.includes(ext)) {
      redirect("/mypage/partner/new?error=허용되지 않는 파일 형식입니다.");
    }

    const storageKey = `${randomUUID()}.${ext}`;
    const { error: uploadError } = await admin.storage
      .from(ATTACHMENT_BUCKET)
      .upload(storageKey, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
      });

    if (uploadError) {
      redirect(`/mypage/partner/new?error=${encodeURIComponent("파일 업로드에 실패했습니다: " + uploadError.message)}`);
    }

    attachment_url = admin.storage.from(ATTACHMENT_BUCKET).getPublicUrl(storageKey).data.publicUrl;
    attachment_name = file.name;
  }

  const { error } = await admin.from("partner_posts").insert({
    member_id: user.id,
    title,
    content,
    attachment_url,
    attachment_name,
  });

  if (error) {
    redirect(`/mypage/partner/new?error=${encodeURIComponent(error.message)}`);
  }

  await notifyAdminNewSubmission(admin, {
    boardLabel: "거래처 게시판",
    title,
    authorName: member.partner_name ?? member.nickname ?? member.name ?? "거래처",
    authorEmail: user.email ?? "",
    preview: stripHtmlPreview(content),
    ctaPath: "/admin/consulting/partner",
  });

  revalidatePath("/mypage/partner");
  redirect("/mypage/partner");
}

export async function addPartnerComment(postId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  if (!content) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/mypage/partner/${postId}`);

  const admin = createAdminClient();
  const { data: post } = await admin
    .from("partner_posts")
    .select("member_id")
    .eq("id", postId)
    .maybeSingle();

  if (!post || post.member_id !== user.id) redirect("/mypage/partner");

  const { data: member } = await admin
    .from("members")
    .select("nickname, name")
    .eq("user_id", user.id)
    .maybeSingle();

  await admin.from("partner_post_comments").insert({
    post_id: postId,
    author_name: member?.nickname ?? member?.name ?? "거래처",
    content,
    is_admin: false,
    user_id: user.id,
  });

  // Reopen the thread for admin attention once the partner follows up again.
  await admin
    .from("partner_posts")
    .update({ status: "미답변", processed_at: null })
    .eq("id", postId);

  revalidatePath(`/mypage/partner/${postId}`);
  revalidatePath("/mypage/partner");
}
