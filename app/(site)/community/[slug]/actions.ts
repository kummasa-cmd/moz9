"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { canEdit, canWriteToBoard } from "@/lib/community-auth";
import { notifyAdminNewSubmission, stripHtmlPreview } from "@/lib/mail";

export async function createPost(slug: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "") || null;

  if (!title || !content) {
    redirect(`/community/${slug}/new?error=제목과 내용을 입력해 주세요.`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/new`);

  const admin = createAdminClient();

  const { data: board } = await admin
    .from("boards")
    .select("id, type, allow_user_write, column_only")
    .eq("slug", slug)
    .maybeSingle();

  if (!board || !(await canWriteToBoard(user, board))) redirect(`/community/${slug}`);

  const { data: memberData } = await admin.from("members").select("nickname").eq("user_id", user.id).maybeSingle();
  const author = memberData?.nickname ?? user.user_metadata?.name ?? user.email ?? "익명";

  const { data: inserted, error } = await admin
    .from("board_posts")
    .insert({
      board_id: board.id,
      title,
      content,
      category_id,
      author,
      user_id: user.id,
      status: "게시중",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/community/${slug}/new?error=${encodeURIComponent(error.message)}`);
  }

  if (board.type === "개인") {
    await notifyAdminNewSubmission(admin, {
      boardLabel: "1대1 문의",
      title,
      authorName: author,
      authorEmail: user.email ?? "",
      preview: stripHtmlPreview(content),
      ctaPath: `/community/${slug}/${inserted.id}`,
    });
  }

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
  redirect(`/community/${slug}`);
}

export async function updatePost(slug: string, postId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const category_id = String(formData.get("category_id") ?? "") || null;

  if (!title || !content) {
    redirect(`/community/${slug}/${postId}/edit?error=제목과 내용을 입력해 주세요.`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/${postId}/edit`);

  const admin = createAdminClient();

  const [{ data: post }, { data: board }] = await Promise.all([
    admin.from("board_posts").select("user_id").eq("id", postId).maybeSingle(),
    admin.from("boards").select("column_only").eq("slug", slug).maybeSingle(),
  ]);

  if (!(await canEdit(user, post?.user_id ?? null, board?.column_only ?? false))) {
    redirect(`/community/${slug}/${postId}`);
  }

  await admin.from("board_posts").update({ title, content, category_id }).eq("id", postId);

  revalidatePath(`/community/${slug}`);
  revalidatePath(`/community/${slug}/${postId}`);
  redirect(`/community/${slug}/${postId}`);
}

export async function deletePost(formData: FormData) {
  const postId = String(formData.get("post_id") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const admin = createAdminClient();

  const [{ data: post }, { data: board }] = await Promise.all([
    admin.from("board_posts").select("user_id").eq("id", postId).maybeSingle(),
    admin.from("boards").select("column_only").eq("slug", slug).maybeSingle(),
  ]);

  if (!(await canEdit(user, post?.user_id ?? null, board?.column_only ?? false))) return;

  await admin.from("board_posts").delete().eq("id", postId);

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
  redirect(`/community/${slug}`);
}

export async function deletePosts(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const slug = String(formData.get("slug") ?? "");
  if (ids.length === 0) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const [{ data: rows }, { data: board }] = await Promise.all([
    admin.from("board_posts").select("id, user_id").in("id", ids),
    admin.from("boards").select("column_only").eq("slug", slug).maybeSingle(),
  ]);

  const allowed: string[] = [];
  for (const row of rows ?? []) {
    if (await canEdit(user, row.user_id, board?.column_only ?? false)) allowed.push(row.id);
  }
  if (allowed.length === 0) return;

  await admin.from("board_posts").delete().in("id", allowed);

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
}
