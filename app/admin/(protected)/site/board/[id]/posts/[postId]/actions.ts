"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addComment(boardId: string, postId: string, formData: FormData) {
  const author_name = String(formData.get("author_name") ?? "").trim() || "관리자";
  const content = String(formData.get("content") ?? "").trim();
  const parent_id = String(formData.get("parent_id") ?? "") || null;

  if (!content) return;

  const supabase = await createClient();
  await supabase.from("board_comments").insert({
    post_id: postId,
    parent_id,
    author_name,
    content,
  });

  revalidatePath(`/admin/site/board/${boardId}/posts/${postId}`);
}

export async function deleteComment(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const boardId = String(formData.get("board_id") ?? "");
  const postId = String(formData.get("post_id") ?? "");

  const supabase = await createClient();
  await supabase.from("board_comments").delete().eq("id", id);

  revalidatePath(`/admin/site/board/${boardId}/posts/${postId}`);
}
