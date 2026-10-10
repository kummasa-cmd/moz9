// Admin session tokens (admin-session-v2). SERVER-ONLY.
//
// HS256 JWT signed with the dedicated ADMIN_SESSION_SIGNING_SECRET (never the
// Supabase service-role key), bound to issuer, environment audience and token
// version. Stage 6-D3b removed the v1 verifier from the runtime: a v1 token
// ({ sub, exp } signed with SUPABASE_SERVICE_ROLE_KEY, cookie "admin-token")
// is never accepted — every admin logs in once after the switch (option A).
// Rolling back to v1 means redeploying the previous build, not a code path.
//
// The verifier returns only the admin id. No other claim (role, authority,
// grants…) is ever read from a token: permissions come from the server
// (lib/admin-guard.ts, lib/sns-lab/authority GrantRegistry), never the JWT.

import { SignJWT, jwtVerify } from "jose";

export const ADMIN_SESSION_VERSION = "admin-session-v2";
/** Token-version claim value for v2; anything else is rejected. */
export const SESSION_TOKEN_VERSION = 2;
export const SESSION_ISSUER = "moz9:admin-session";
export const SESSION_ALG = "HS256";
/** Session lifetime (unchanged from v1 and the cookie maxAge). */
export const SESSION_TTL_SECONDS = 60 * 60 * 24;
/** Accepted clock skew between server instances. */
export const CLOCK_SKEW_SECONDS = 60;

export type SessionEnvironment = "production" | "preview" | "development" | "local";

/** Vercel sets VERCEL_ENV; anything else (next dev / next start / scripts) is "local". */
export function resolveSessionEnvironment(env: Readonly<Record<string, string | undefined>>): SessionEnvironment {
  const v = env.VERCEL_ENV;
  return v === "production" || v === "preview" || v === "development" ? v : "local";
}

export const sessionAudience = (environment: SessionEnvironment) => `moz9:admin:${environment}`;

export type VerifyResult =
  | { ok: true; adminId: string }
  | { ok: false; reason: VerifyRejection };

export type VerifyRejection =
  | "NO_TOKEN"
  | "NO_KEY"
  | "MALFORMED"
  | "BAD_ALGORITHM"
  | "BAD_SIGNATURE"
  | "EXPIRED"
  | "NOT_YET_VALID"
  | "IAT_IN_FUTURE"
  | "LIFETIME_TOO_LONG"
  | "BAD_ISSUER"
  | "BAD_AUDIENCE"
  | "BAD_VERSION"
  | "BAD_SUBJECT"
  | "MISSING_CLAIM";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);

/** Reads the unverified JOSE header only to classify a rejection. Never trusted. */
function headerAlg(token: string): string | null {
  try {
    const h = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    return typeof h?.alg === "string" ? h.alg : null;
  } catch {
    return null;
  }
}

function classify(error: unknown, token: string): VerifyRejection {
  const code = (error as { code?: string })?.code;
  const claim = (error as { claim?: string })?.claim;
  const alg = headerAlg(token);
  if (alg === null) return "MALFORMED";
  if (alg !== SESSION_ALG) return "BAD_ALGORITHM";
  switch (code) {
    case "ERR_JWT_EXPIRED":
      return claim === "iat" ? "LIFETIME_TOO_LONG" : "EXPIRED";
    case "ERR_JWS_SIGNATURE_VERIFICATION_FAILED":
      return "BAD_SIGNATURE";
    case "ERR_JOSE_ALG_NOT_ALLOWED":
      return "BAD_ALGORITHM";
    case "ERR_JWT_CLAIM_VALIDATION_FAILED":
      if (claim === "iss") return "BAD_ISSUER";
      if (claim === "aud") return "BAD_AUDIENCE";
      if (claim === "nbf") return "NOT_YET_VALID";
      if (claim === "iat") return "IAT_IN_FUTURE";
      return "MISSING_CLAIM";
    default:
      return "MALFORMED";
  }
}

export type SignV2Input = {
  adminId: string;
  key: Uint8Array;
  environment: SessionEnvironment;
  now?: Date;
  /** Random id per session (injected for deterministic reports). */
  jti?: string;
};

export async function signAdminSessionV2(input: SignV2Input): Promise<string> {
  if (!UUID.test(input.adminId)) throw new Error("adminId must be a UUID");
  if (!(input.key instanceof Uint8Array) || input.key.length === 0) throw new Error("no signing key");
  const iat = epoch(input.now ?? new Date());
  return new SignJWT({ sv: SESSION_TOKEN_VERSION })
    .setProtectedHeader({ alg: SESSION_ALG, typ: "JWT" })
    .setIssuer(SESSION_ISSUER)
    .setAudience(sessionAudience(input.environment))
    .setSubject(input.adminId)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .setJti(input.jti ?? crypto.randomUUID())
    .sign(input.key);
}

export type VerifyV2Input = {
  token: string | undefined | null;
  /** null when the secret is missing / rejected → always fail-closed. */
  key: Uint8Array | null;
  environment: SessionEnvironment;
  now?: Date;
};

export async function verifyAdminSessionV2(input: VerifyV2Input): Promise<VerifyResult> {
  const { token, key } = input;
  if (!token) return { ok: false, reason: "NO_TOKEN" };
  if (!key || key.length === 0) return { ok: false, reason: "NO_KEY" };
  const now = input.now ?? new Date();
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: [SESSION_ALG],
      typ: "JWT",
      issuer: SESSION_ISSUER,
      audience: sessionAudience(input.environment),
      requiredClaims: ["sub", "iat", "nbf", "exp", "jti", "sv"],
      maxTokenAge: SESSION_TTL_SECONDS + CLOCK_SKEW_SECONDS,
      clockTolerance: CLOCK_SKEW_SECONDS,
      currentDate: now,
    });
    if (payload.sv !== SESSION_TOKEN_VERSION) return { ok: false, reason: "BAD_VERSION" };
    // jose already rejects iat beyond the tolerance; keep the explicit checks as the policy of record.
    if ((payload.iat as number) > epoch(now) + CLOCK_SKEW_SECONDS) return { ok: false, reason: "IAT_IN_FUTURE" };
    if ((payload.exp as number) - (payload.iat as number) > SESSION_TTL_SECONDS) return { ok: false, reason: "LIFETIME_TOO_LONG" };
    if (typeof payload.sub !== "string" || !UUID.test(payload.sub)) return { ok: false, reason: "BAD_SUBJECT" };
    return { ok: true, adminId: payload.sub };
  } catch (error) {
    return { ok: false, reason: classify(error, token) };
  }
}
