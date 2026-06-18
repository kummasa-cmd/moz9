import type { User } from "@supabase/supabase-js";
import { getAdminSession } from "./admin-auth";

export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  return session !== null;
}

export async function canEdit(
  user: User | null,
  postUserId: string | null,
): Promise<boolean> {
  if (await isAdmin()) return true;
  if (!user) return false;
  return user.id === postUserId;
}
