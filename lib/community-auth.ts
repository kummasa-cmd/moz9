import type { User } from "@supabase/supabase-js";

export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  if (user.app_metadata?.role === "admin") return true;
  const adminEmail = process.env.ADMIN_EMAIL ?? "";
  return !!adminEmail && user.email === adminEmail;
}

export function canEdit(user: User | null, postUserId: string | null): boolean {
  if (!user) return false;
  return isAdmin(user) || user.id === postUserId;
}
