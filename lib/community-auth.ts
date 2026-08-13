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
  columnOnly: boolean = false,
): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!user) return false;
  if (user.id !== postUserId) return false;
  if (columnOnly) return isColumnMember(user.id);
  return true;
}

export async function canWriteToBoard(
  user: User | null,
  board: { allow_user_write: boolean; column_only: boolean },
): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!user) return false;
  if (!board.allow_user_write) return false;
  if (board.column_only) return isColumnMember(user.id);
  return true;
}
