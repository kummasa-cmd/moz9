"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createMember(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const nickname = String(formData.get("nickname") ?? "") || null;
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "") || null;
  const grade = String(formData.get("grade") ?? "일반");
  const status = String(formData.get("status") ?? "정상");
  const memo = String(formData.get("memo") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .insert({ name, nickname, email, phone, grade, status, memo });

  if (error) {
    redirect(`/admin/members/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function updateMember(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const nickname = String(formData.get("nickname") ?? "") || null;
  const email = String(formData.get("email") ?? "");
  const phone = String(formData.get("phone") ?? "") || null;
  const grade = String(formData.get("grade") ?? "일반");
  const status = String(formData.get("status") ?? "정상");
  const memo = String(formData.get("memo") ?? "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ name, nickname, email, phone, grade, status, memo })
    .eq("id", id);

  if (error) {
    redirect(`/admin/members/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function deleteMember(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = await createClient();
  await supabase.from("members").delete().eq("id", id);

  revalidatePath("/admin/members");
}
