"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createBoard(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const type = String(formData.get("type") ?? "일반");
  const sort_order = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  const is_visible = formData.get("is_visible") === "on";
  const allow_user_write = formData.get("allow_user_write") === "on";
  const use_category = formData.get("use_category") === "on";
  const use_comment = formData.get("use_comment") === "on";

  if (!/^[a-z0-9-]+$/.test(slug)) {
    redirect(
      `/admin/site/board/new?error=${encodeURIComponent("슬러그는 영소문자, 숫자, 하이픈만 사용 가능합니다.")}`
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("boards").insert({
    name,
    slug,
    type,
    sort_order,
    is_visible,
    allow_user_write,
    use_category,
    use_comment,
  });

  if (error) {
    redirect(`/admin/site/board/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/board");
  redirect("/admin/site/board");
}

export async function updateBoard(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const type = String(formData.get("type") ?? "일반");
  const sort_order = parseInt(String(formData.get("sort_order") ?? "0"), 10) || 0;
  const is_visible = formData.get("is_visible") === "on";
  const allow_user_write = formData.get("allow_user_write") === "on";
  const use_category = formData.get("use_category") === "on";
  const use_comment = formData.get("use_comment") === "on";

  if (!/^[a-z0-9-]+$/.test(slug)) {
    redirect(
      `/admin/site/board/${id}/edit?error=${encodeURIComponent("슬러그는 영소문자, 숫자, 하이픈만 사용 가능합니다.")}`
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("boards")
    .update({ name, slug, type, sort_order, is_visible, allow_user_write, use_category, use_comment })
    .eq("id", id);

  if (error) {
    redirect(`/admin/site/board/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/site/board");
  redirect("/admin/site/board");
}

export async function deleteBoard(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const supabase = createAdminClient();
  await supabase.from("boards").delete().eq("id", id);
  revalidatePath("/admin/site/board");
}
