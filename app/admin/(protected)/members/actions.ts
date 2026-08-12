"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export async function createMember(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const nickname = String(formData.get("nickname") ?? "") || null;
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "") || null;
  const grade = String(formData.get("grade") ?? "일반");
  const status = String(formData.get("status") ?? "정상");
  const memo = String(formData.get("memo") ?? "") || null;

  if (password.length < 6) {
    redirect("/admin/members/new?error=비밀번호는 6자 이상이어야 합니다.");
  }

  const supabase = createAdminClient();

  const { data: existingMember } = await supabase
    .from("members")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingMember) {
    redirect("/admin/members/new?error=이미 등록된 이메일입니다.");
  }

  let userId: string;
  let createdNewAuth = false;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname: nickname ?? name },
  });

  if (authError) {
    if (!authError.message.includes("already been registered")) {
      redirect(`/admin/members/new?error=${encodeURIComponent(authError.message)}`);
    }

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const existing = users.find((u) => u.email === email);
    if (!existing) {
      redirect("/admin/members/new?error=Auth 사용자를 찾을 수 없습니다.");
    }

    await supabase.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: { nickname: nickname ?? name },
    });
    userId = existing.id;
  } else {
    userId = authData.user.id;
    createdNewAuth = true;
  }

  const { error } = await supabase.from("members").insert({
    user_id: userId,
    name,
    nickname,
    email,
    phone,
    grade,
    status,
    memo,
  });

  if (error) {
    if (createdNewAuth) {
      await supabase.auth.admin.deleteUser(userId);
    }
    redirect(`/admin/members/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function updateMember(id: string, formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const nickname = String(formData.get("nickname") ?? "") || null;
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "") || null;
  const grade = String(formData.get("grade") ?? "일반");
  const status = String(formData.get("status") ?? "정상");
  const memo = String(formData.get("memo") ?? "") || null;

  const is_column_member = formData.get("is_column_member") === "on";
  const is_partner = formData.get("is_partner") === "on";
  const partner_name = String(formData.get("partner_name") ?? "") || null;
  const partner_homepage = String(formData.get("partner_homepage") ?? "") || null;
  const partner_address = String(formData.get("partner_address") ?? "") || null;
  const partner_phone = String(formData.get("partner_phone") ?? "") || null;
  const partner_product = String(formData.get("partner_product") ?? "") || null;
  const partner_contract_start = String(formData.get("partner_contract_start") ?? "") || null;
  const partner_contract_end = String(formData.get("partner_contract_end") ?? "") || null;
  const partner_note = String(formData.get("partner_note") ?? "") || null;
  const partner_active = formData.get("partner_active") === "on";

  if (password && password.length < 6) {
    redirect(`/admin/members/${id}/edit?error=비밀번호는 6자 이상이어야 합니다.`);
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("members")
    .update({
      name,
      nickname,
      email,
      phone,
      grade,
      status,
      memo,
      is_column_member,
      is_partner,
      partner_name,
      partner_homepage,
      partner_address,
      partner_phone,
      partner_product,
      partner_contract_start,
      partner_contract_end,
      partner_note,
      partner_active,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/members/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  if (password) {
    const { data: member } = await supabase
      .from("members")
      .select("user_id")
      .eq("id", id)
      .maybeSingle();

    if (member?.user_id) {
      const { error: authError } = await supabase.auth.admin.updateUserById(
        member.user_id,
        { password }
      );

      if (authError) {
        redirect(
          `/admin/members/${id}/edit?error=${encodeURIComponent(authError.message)}`
        );
      }
    }
  }

  revalidatePath("/admin/members");
  redirect("/admin/members");
}

export async function deleteMember(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  const supabase = createAdminClient();

  const { data: member } = await supabase
    .from("members")
    .select("user_id")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("members").delete().eq("id", id);

  if (member?.user_id) {
    await supabase.auth.admin.deleteUser(member.user_id);
  }

  revalidatePath("/admin/members");
}

export async function deleteMembers(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return;

  const supabase = createAdminClient();

  const { data: members } = await supabase.from("members").select("id, user_id").in("id", ids);

  await supabase.from("members").delete().in("id", ids);

  for (const member of members ?? []) {
    if (member.user_id) {
      await supabase.auth.admin.deleteUser(member.user_id);
    }
  }

  revalidatePath("/admin/members");
}
