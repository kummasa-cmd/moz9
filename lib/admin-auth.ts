import { cookies } from "next/headers";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { legacyCookiePolicy } from "@/lib/admin-session/cookie";
import { legacyAdminSessionKey, verifyLegacyAdminToken } from "@/lib/admin-session/token";

// Session format v1 (unchanged token format, see lib/admin-session/token.ts).
// Stage 6-D2 hardening: no hard-coded fallback secret (a missing key now
// fails closed) and the verifier accepts HS256 only. The switch to the
// dedicated-secret v2 format is a separate, approved step
// (docs/sns-lab-admin-session.md).

function getSecret(): Uint8Array | null {
  return legacyAdminSessionKey(process.env);
}

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
  const secret = getSecret();
  if (!secret) throw new Error("Admin session signing key is not configured");

  const token = await new SignJWT({ sub: adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);

  const { name, options } = legacyCookiePolicy(process.env.NODE_ENV);
  const cookieStore = await cookies();
  cookieStore.set(name, token, options);
}

export async function getAdminSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(legacyCookiePolicy(process.env.NODE_ENV).name)?.value;
  const result = await verifyLegacyAdminToken(token, getSecret());
  return result.ok ? result.adminId : null;
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(legacyCookiePolicy(process.env.NODE_ENV).name);
}
