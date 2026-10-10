// Admin session cookie policy (admin-session-v2). SERVER-ONLY.
//
// On Vercel the cookie gets the __Host- prefix, which the browser only
// accepts with Secure, Path=/ and no Domain — so it cannot be set over http
// or scoped to another subdomain. Plain-http `next dev` ("local") uses an
// unprefixed name. The v1 cookie "admin-token" is never read; login and
// logout only expire it so old cookies do not linger.
//
// SameSite stays Lax: Next.js Server Actions already reject cross-origin POSTs
// (Origin vs Host check), and Strict would drop the session on every link
// into /admin from another site (e.g. a notification e-mail).

import { SESSION_TTL_SECONDS, type SessionEnvironment } from "./token";

/** The v1 cookie name. Only ever expired, never read. */
export const LEGACY_ADMIN_COOKIE = "admin-token";

export type CookieOptions = { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number };
export type CookiePolicy = { name: string; options: CookieOptions };

export function v2CookiePolicy(environment: SessionEnvironment): CookiePolicy {
  const secure = environment !== "local";
  return {
    name: secure ? "__Host-moz9-admin-session" : "moz9-admin-session",
    options: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

/**
 * Options that expire a cookie. A __Host- cookie is only replaced by a
 * Set-Cookie with the same Secure / Path attributes, so a plain
 * `cookies().delete(name)` (no Secure) would leave it in place.
 */
export function expiredCookie(policy: CookiePolicy): CookiePolicy {
  return { name: policy.name, options: { ...policy.options, maxAge: 0 } };
}

/** Expires the v1 cookie with the attributes it was issued with (Secure on deployments). */
export function expiredLegacyCookie(environment: SessionEnvironment): CookiePolicy {
  return { name: LEGACY_ADMIN_COOKIE, options: { httpOnly: true, secure: environment !== "local", sameSite: "lax", path: "/", maxAge: 0 } };
}
