// Admin session cookie policy. SERVER-ONLY.
//
// v1 (deployed): "admin-token", HttpOnly, Secure only when NODE_ENV=production,
// SameSite=Lax, Path=/, Max-Age 24h.
// v2 (prepared): on Vercel the cookie gets the __Host- prefix, which the
// browser only accepts with Secure, Path=/ and no Domain — so it cannot be set
// over http or scoped to another subdomain. A different name also keeps v1 and
// v2 cookies from ever being confused during the switch.
//
// SameSite stays Lax: Next.js Server Actions already reject cross-origin POSTs
// (Origin vs Host check), and Strict would drop the session on every link
// into /admin from another site (e.g. a notification e-mail).

import { SESSION_TTL_SECONDS, type SessionEnvironment } from "./token";

export const LEGACY_ADMIN_COOKIE = "admin-token";

export type CookiePolicy = {
  name: string;
  options: { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/"; maxAge: number };
};

export function legacyCookiePolicy(nodeEnv: string | undefined): CookiePolicy {
  return {
    name: LEGACY_ADMIN_COOKIE,
    options: { httpOnly: true, secure: nodeEnv === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}

export function v2CookiePolicy(environment: SessionEnvironment): CookiePolicy {
  // "local" is plain-http `next dev`; everything deployed is https.
  const secure = environment !== "local";
  return {
    name: secure ? "__Host-moz9-admin-session" : "moz9-admin-session",
    options: { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS },
  };
}
