import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { AdminSessionConfigError, adminSessionV2Config, verifyAdminSessionCookie } from "@/lib/admin-session/config";
import { expiredCookie, expiredLegacyCookie } from "@/lib/admin-session/cookie";
import { signAdminSessionV2 } from "@/lib/admin-session/token";

// Admin session = admin-session-v2 (lib/admin-session/): HS256 JWT signed with
// ADMIN_SESSION_SIGNING_SECRET, bound to the deployment environment, in the
// __Host-moz9-admin-session cookie. A missing or rejected secret fails closed:
// no session is issued (AdminSessionConfigError) and none is accepted.
// v1 sessions (cookie "admin-token", signed with the service-role key) are
// not accepted; login and logout expire that cookie.

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createAdminSession(adminId: string) {
  const config = adminSessionV2Config(process.env);
  if (!config.key) throw new AdminSessionConfigError(config.secretStatus === "ok" ? "MISSING" : config.secretStatus);

  const token = await signAdminSessionV2({ adminId, key: config.key, environment: config.environment });

  const cookieStore = await cookies();
  cookieStore.set(config.cookie.name, token, config.cookie.options);
  const legacy = expiredLegacyCookie(config.environment);
  cookieStore.set(legacy.name, "", legacy.options);
}

export async function getAdminSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const config = adminSessionV2Config(process.env);
  const result = await verifyAdminSessionCookie(cookieStore.get(config.cookie.name)?.value, process.env);
  return result.ok ? result.adminId : null;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  const config = adminSessionV2Config(process.env);
  for (const { name, options } of [expiredCookie(config.cookie), expiredLegacyCookie(config.environment)]) {
    cookieStore.set(name, "", options);
  }
}
