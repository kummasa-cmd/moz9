"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBoardPost(boardId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const status = String(formData.get("status") ?? "게시중");
  const category_id = String(formData.get("category_id") ?? "") || null;
  const author = String(formData.get("author") ?? "").trim() || null;
  const published_at = String(formData.get("published_at") ?? "") || null;
  const is_notice = formData.get("is_notice") === "on";

  const supabase = await createClient();
  const { error } = await supabase.from("board_posts").insert({
    board_id: boardId,
    title,
    content,
    status,
    category_id,
    author,
    published_at,
    is_notice,
  });

  if (error) {
    redirect(
      `/admin/site/board/${boardId}/posts/new?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/admin/site/board/${boardId}/posts`);
  revalidatePath("/admin/site/board");
  redirect(`/admin/site/board/${boardId}/posts`);
}

export async function updateBoardPost(boardId: string, postId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  const status = String(formData.get("status") ?? "게시중");
  const category_id = String(formData.get("category_id") ?? "") || null;
  const author = String(formData.get("author") ?? "").trim() || null;
  const published_at = String(formData.get("published_at") ?? "") || null;
  const is_notice = formData.get("is_notice") === "on";

  const supabase = await createClient();
  const { error } = await supabase
    .from("board_posts")
    .update({ title, content, status, category_id, author, published_at, is_notice })
    .eq("id", postId)
    .eq("board_id", boardId);

  if (error) {
    redirect(
      `/admin/site/board/${boardId}/posts/${postId}/edit?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/admin/site/board/${boardId}/posts`);
  redirect(`/admin/site/board/${boardId}/posts`);
}

export async function deleteBoardPost(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const boardId = String(formData.get("board_id") ?? "");

  const supabase = await createClient();
  await supabase.from("board_posts").delete().eq("id", id);

  revalidatePath(`/admin/site/board/${boardId}/posts`);
  revalidatePath("/admin/site/board");
}
