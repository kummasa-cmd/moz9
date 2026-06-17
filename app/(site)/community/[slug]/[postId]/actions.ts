"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/community-auth";

export async function addComment(slug: string, postId: string, formData: FormData) {
  const content = String(formData.get("content") ?? "").trim();
  const author_name = String(formData.get("author_name") ?? "").trim() || "익명";
  const parent_id = String(formData.get("parent_id") ?? "") || null;

  if (!content) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Check if board is private — require login
  const { data: board } = await supabase
    .from("boards")
    .select("type, use_comment")
    .eq("slug", slug)
    .maybeSingle();

  if (!board?.use_comment) return;
  if (board.type === "개인" && !user) redirect(`/login?next=/community/${slug}/${postId}`);

  let resolvedAuthor = author_name;
  if (user) {
    const { data: memberData } = await supabase.from("members").select("nickname").eq("user_id", user.id).maybeSingle();
    resolvedAuthor = memberData?.nickname ?? user.user_metadata?.name ?? user.email ?? author_name;
  }

  await supabase.from("board_comments").insert({
    post_id: postId,
    parent_id,
    author_name: resolvedAuthor,
    content,
    user_id: user?.id ?? null,
  });

  revalidatePath(`/community/${slug}/${postId}`);
}

export async function deleteComment(formData: FormData) {
  const commentId = String(formData.get("comment_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const postId = String(formData.get("post_id") ?? "");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: comment } = await supabase
    .from("board_comments")
    .select("user_id")
    .eq("id", commentId)
    .maybeSingle();

  const admin = isAdmin(user);
  if (!admin && comment?.user_id !== user.id) return;

  await supabase.from("board_comments").delete().eq("id", commentId);

  revalidatePath(`/community/${slug}/${postId}`);
}
