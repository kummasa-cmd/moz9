"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPost(formData: FormData) {
  const board = String(formData.get("board") ?? "공지사항");
  const title = String(formData.get("title") ?? "");
  const content = String(formData.get("content") ?? "");
  const status = String(formData.get("status") ?? "게시중");

  const supabase = await createClient();
  const { error } = await supabase.from("board_posts").insert({ board, title, content, status });

  if (error) {
    redirect(`/admin/site/board/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/board");
  redirect("/admin/site/board");
}

export async function updatePost(id: string, formData: FormData) {
  const board = String(formData.get("board") ?? "공지사항");
  const title = String(formData.get("title") ?? "");
  const content = String(formData.get("content") ?? "");
  const status = String(formData.get("status") ?? "게시중");

  const supabase = await createClient();
  const { error } = await supabase
    .from("board_posts")
    .update({ board, title, content, status })
    .eq("id", id);

  if (error) {
    redirect(`/admin/site/board/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/board");
  redirect("/admin/site/board");
}

export async function deletePost(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("board_posts").delete().eq("id", id);

  revalidatePath("/admin/site/board");
}
