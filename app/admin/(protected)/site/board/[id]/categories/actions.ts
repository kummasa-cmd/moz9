"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createCategory(boardId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sort_order = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;

  const supabase = createAdminClient();
  const { error } = await supabase.from("board_categories").insert({
    board_id: boardId,
    name,
    sort_order,
  });

  if (error) {
    redirect(
      `/admin/site/board/${boardId}/categories?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/admin/site/board/${boardId}/categories`);
}

export async function updateCategory(boardId: string, catId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const sort_order = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("board_categories")
    .update({ name, sort_order })
    .eq("id", catId);

  if (error) {
    redirect(
      `/admin/site/board/${boardId}/categories/${catId}/edit?error=${encodeURIComponent(
        error.message
      )}`
    );
  }

  revalidatePath(`/admin/site/board/${boardId}/categories`);
  redirect(`/admin/site/board/${boardId}/categories`);
}

export async function deleteCategory(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const boardId = String(formData.get("board_id") ?? "");

  const supabase = createAdminClient();
  await supabase.from("board_categories").delete().eq("id", id);

  revalidatePath(`/admin/site/board/${boardId}/categories`);
}
