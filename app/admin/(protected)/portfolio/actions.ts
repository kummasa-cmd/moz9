"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createPortfolioItem(formData: FormData) {
  const title = String(formData.get("title") ?? "");
  const category = String(formData.get("category") ?? "홈페이지 제작");
  const status = String(formData.get("status") ?? "공개");
  const link = String(formData.get("link") ?? "") || null;
  const description = String(formData.get("description") ?? "");
  const thumbnail_url = String(formData.get("thumbnail_url") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("portfolio_items")
    .insert({ title, category, status, link, description, thumbnail_url });

  if (error) {
    redirect(`/admin/portfolio/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/portfolio");
  redirect("/admin/portfolio");
}

export async function updatePortfolioItem(id: string, formData: FormData) {
  const title = String(formData.get("title") ?? "");
  const category = String(formData.get("category") ?? "홈페이지 제작");
  const status = String(formData.get("status") ?? "공개");
  const link = String(formData.get("link") ?? "") || null;
  const description = String(formData.get("description") ?? "");
  const thumbnail_url = String(formData.get("thumbnail_url") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("portfolio_items")
    .update({ title, category, status, link, description, thumbnail_url })
    .eq("id", id);

  if (error) {
    redirect(`/admin/portfolio/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/portfolio");
  redirect("/admin/portfolio");
}

export async function deletePortfolioItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("portfolio_items").delete().eq("id", id);

  revalidatePath("/admin/portfolio");
}
