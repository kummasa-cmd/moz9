"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function generateOrderNo() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${year}-${random}`;
}

export async function createOrder(formData: FormData) {
  const customer = String(formData.get("customer") ?? "");
  const product = String(formData.get("product") ?? "");
  const amount = String(formData.get("amount") ?? "");
  const status = String(formData.get("status") ?? "결제대기");
  const memo = String(formData.get("memo") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .insert({ order_no: generateOrderNo(), customer, product, amount, status, memo });

  if (error) {
    redirect(`/admin/orders/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/orders");
  redirect("/admin/orders");
}
