// admin-session-v2 configuration and the ONE session verifier. SERVER-ONLY.
//
// lib/admin-auth.ts (login / getAdminSession → checkAdmin / requireAdmin) and
// the proxy (lib/admin-session/proxy-gate.ts) both verify through
// verifyAdminSessionCookie(), so every path applies the same secret,
// environment audience, cookie name and token version.

import { v2CookiePolicy, type CookiePolicy } from "./cookie";
import { checkAdminSessionSecret, type SecretRejection } from "./secret";
import { resolveSessionEnvironment, verifyAdminSessionV2, type SessionEnvironment, type VerifyResult } from "./token";

export type AdminSessionV2Config = {
  environment: SessionEnvironment;
  /** null = secret missing or rejected: no session can be issued or accepted. */
  key: Uint8Array | null;
  secretStatus: "ok" | SecretRejection;
  cookie: CookiePolicy;
};

export function adminSessionV2Config(env: Readonly<Record<string, string | undefined>>): AdminSessionV2Config {
  const environment = resolveSessionEnvironment(env);
  const secret = checkAdminSessionSecret(env);
  return {
    environment,
    key: secret.ok ? secret.key : null,
    secretStatus: secret.ok ? "ok" : secret.reason,
    cookie: v2CookiePolicy(environment),
  };
}

/** Thrown when a session cannot be issued because the secret is missing / rejected. Carries the reason code only. */
export class AdminSessionConfigError extends Error {
  constructor(readonly reason: SecretRejection) {
    super(`Admin session signing secret unavailable (${reason})`);
    this.name = "AdminSessionConfigError";
  }
}

/** Verifies an admin session cookie value. Fail-closed: no / rejected secret → NO_KEY. Never throws. */
export async function verifyAdminSessionCookie(
  token: string | undefined | null,
  env: Readonly<Record<string, string | undefined>>,
  now?: Date,
): Promise<VerifyResult> {
  try {
    const cfg = adminSessionV2Config(env);
    return await verifyAdminSessionV2({ token, key: cfg.key, environment: cfg.environment, now });
  } catch {
    return { ok: false, reason: "MALFORMED" };
  }
}
