"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProduct(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const type = String(formData.get("type") ?? "패키지");
  const setup_fee = String(formData.get("setupFee") ?? "") || null;
  const monthly_fee = String(formData.get("monthlyFee") ?? "") || null;
  const status = String(formData.get("status") ?? "판매중");
  const description = String(formData.get("description") ?? "");

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .insert({ name, type, setup_fee, monthly_fee, status, description });

  if (error) {
    redirect(`/admin/products/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/products");
  redirect("/admin/products");
}
