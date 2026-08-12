import type { User } from "@supabase/supabase-js";
import { getAdminSession } from "./admin-auth";
import { createAdminClient } from "./supabase/admin";

export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

export async function isColumnMember(userId: string | null): Promise<boolean> {
  if (!userId) return false;

  const db = createAdminClient();
  const { data } = await db
    .from("members")
    .select("is_column_member")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.is_column_member ?? false;
}

export async function canEdit(
  user: User | null,
  postUserId: string | null,
): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!user) return false;
  return user.id === postUserId;
}
