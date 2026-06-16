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

  const supabase = await createClient();
  const { error } = await supabase
    .from("portfolio_items")
    .insert({ title, category, status, link, description });

  if (error) {
    redirect(`/admin/portfolio/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/portfolio");
  redirect("/admin/portfolio");
}
