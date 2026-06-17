"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canEdit } from "@/lib/community-auth";

export async function createPost(slug: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title || !content) {
    redirect(`/community/${slug}/new?error=제목과 내용을 입력해 주세요.`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/new`);

  const { data: board } = await supabase
    .from("boards")
    .select("id, allow_user_write")
    .eq("slug", slug)
    .maybeSingle();

  if (!board?.allow_user_write) redirect(`/community/${slug}`);

  const { data: memberData } = await supabase.from("members").select("nickname").eq("user_id", user.id).maybeSingle();
  const author = memberData?.nickname ?? user.user_metadata?.name ?? user.email ?? "익명";

  const { error } = await supabase.from("board_posts").insert({
    board_id: board.id,
    title,
    content,
    author,
    user_id: user.id,
    status: "게시중",
  });

  if (error) {
    redirect(`/community/${slug}/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
  redirect(`/community/${slug}`);
}

export async function updatePost(slug: string, postId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();

  if (!title || !content) {
    redirect(`/community/${slug}/${postId}/edit?error=제목과 내용을 입력해 주세요.`);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/community/${slug}/${postId}/edit`);

  const { data: post } = await supabase
    .from("board_posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();

  if (!canEdit(user, post?.user_id ?? null)) redirect(`/community/${slug}/${postId}`);

  await supabase.from("board_posts").update({ title, content }).eq("id", postId);

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

  const { data: post } = await supabase
    .from("board_posts")
    .select("user_id")
    .eq("id", postId)
    .maybeSingle();

  if (!canEdit(user, post?.user_id ?? null)) return;

  await supabase.from("board_posts").delete().eq("id", postId);

  revalidatePath(`/community/${slug}`);
  revalidatePath("/community");
  redirect(`/community/${slug}`);
}
