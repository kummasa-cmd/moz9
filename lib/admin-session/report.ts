// Stage 6-D3b — reproducible admin session security report (admin-session-v2
// wired as the only session format; first written for Stage 6-D2, whose JSON
// in docs/sns-lab-stage6d2 is kept as a historical artifact).
//
// Token cases run through verifyAdminSessionCookie() — the exact verifier
// lib/admin-auth.ts and the proxy use — with a fake environment.
//
// Depends only on lib/admin-guard.ts and lib/admin-session/* (committed code).
// SNS LAB approve/issue grants (lib/sns-lab/authority) are covered by the
// SNS LAB authority report (Stage 6-D1), not here.
//
// FAKE secrets, FAKE admin ids, fixed clock. No database, no network, no
// environment variables, no real token. Tokens never appear in the report (sha256
// prefixes only); secrets never appear at all.

import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { checkAdmin, type AdminGuardDeps } from "../admin-guard";
import { adminSessionV2Config, verifyAdminSessionCookie } from "./config";
import { expiredCookie, expiredLegacyCookie, LEGACY_ADMIN_COOKIE, v2CookiePolicy } from "./cookie";
import { adminGateDecision } from "./proxy-gate";
import { safeAdminRedirect } from "./redirect";
import { ADMIN_SESSION_SECRET_ENV, checkAdminSessionSecret } from "./secret";
import {
  ADMIN_SESSION_VERSION,
  SESSION_ISSUER,
  SESSION_TTL_SECONDS,
  sessionAudience,
  signAdminSessionV2,
  verifyAdminSessionV2,
  type SessionEnvironment,
  type VerifyResult,
} from "./token";

export const REPORT_AS_OF = "2026-10-09T00:00:00.000Z";
export const NOW = new Date(REPORT_AS_OF);
const NOW_S = Math.floor(NOW.getTime() / 1000);

/** TEST-ONLY values. Never configure these anywhere. */
export const FAKE = {
  prodSecret: "TEST-ONLY-prod-k9Qv2xLm7RtZp4Wc8Yb3Nd6Hf1Js5GaUeXo",
  previewSecret: "TEST-ONLY-prev-Zr4Tq8Wm2Kx6Lp9Vb1Nc5Hd3Jf7GsYaEi",
  serviceRole: "eyJhbGciOiJIUzI1NiJ9.TEST-ONLY-fake-service-role-payload.c2lnbmF0dXJl",
  anon: "eyJhbGciOiJIUzI1NiJ9.TEST-ONLY-fake-anon-payload.c2lnbmF0dXJl",
  cron: "TEST-ONLY-cron-Qm3Rv7Tx1Wz5Yb9Kd2Lf6Nh8Pj4SgAcEu",
  admin: "00000000-0000-4000-8000-0000000000a1",
  deletedAdmin: "00000000-0000-4000-8000-0000000000d1",
  jti: "00000000-0000-4000-8000-00000000f001",
} as const;

const enc = (s: string) => new TextEncoder().encode(s);
const PROD_KEY = enc(FAKE.prodSecret);
const PREVIEW_KEY = enc(FAKE.previewSecret);
const LEGACY_KEY = enc(FAKE.serviceRole);
const tokenRef = (t: string) => `sha256:${createHash("sha256").update(t).digest("hex").slice(0, 16)}`;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

const goodV2 = (environment: SessionEnvironment = "production", key = PROD_KEY, now = NOW) =>
  signAdminSessionV2({ adminId: FAKE.admin, key, environment, now, jti: FAKE.jti });

/** A v2-shaped token with arbitrary header / claims, HMAC-signed with `key`. */
async function forge(claims: Record<string, unknown>, opts: { alg?: string; key?: Uint8Array } = {}): Promise<string> {
  const base = {
    iss: SESSION_ISSUER,
    aud: sessionAudience("production"),
    sub: FAKE.admin,
    iat: NOW_S,
    nbf: NOW_S,
    exp: NOW_S + SESSION_TTL_SECONDS,
    jti: FAKE.jti,
    sv: 2,
  };
  const payload = Object.fromEntries(Object.entries({ ...base, ...claims }).filter(([, v]) => v !== undefined));
  return new SignJWT(payload).setProtectedHeader({ alg: opts.alg ?? "HS256", typ: "JWT" }).sign(opts.key ?? PROD_KEY);
}

/** The exact token shape the v1 code (before Stage 6-D3b) issued. */
const legacyToken = (key: Uint8Array = LEGACY_KEY, alg = "HS256") =>
  new SignJWT({ sub: FAKE.admin }).setProtectedHeader({ alg }).setExpirationTime(NOW_S + SESSION_TTL_SECONDS).sign(key);

const v2 = (token: string, environment: SessionEnvironment = "production", key: Uint8Array | null = PROD_KEY, now = NOW) =>
  verifyAdminSessionV2({ token, key, environment, now });

/** Fake runtime environments for verifyAdminSessionCookie(). */
const BASE_ENV = { SUPABASE_SERVICE_ROLE_KEY: FAKE.serviceRole, NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.anon, CRON_SECRET: FAKE.cron };
const PROD_ENV = { ...BASE_ENV, ADMIN_SESSION_SIGNING_SECRET: FAKE.prodSecret, VERCEL_ENV: "production" };
const NO_SECRET_ENV = { ...BASE_ENV, VERCEL_ENV: "production" };
const runtime = (token: string | undefined, env: Record<string, string | undefined> = PROD_ENV) => verifyAdminSessionCookie(token, env, NOW);

type CaseResult = { id: string; title: string; blocked: boolean; outcome: string };

async function tokenCase(id: string, title: string, token: Promise<string>, verify: (t: string) => Promise<VerifyResult>): Promise<CaseResult & { token: string }> {
  const t = await token;
  const r = await verify(t);
  return { id, title, blocked: !r.ok, outcome: r.ok ? "ACCEPTED" : r.reason, token: tokenRef(t) };
}

const secretCase = (id: string, title: string, env: Record<string, string | undefined>): CaseResult => {
  const c = checkAdminSessionSecret(env);
  return { id, title, blocked: !c.ok, outcome: c.ok ? "ACCEPTED" : c.reason };
};

function fakeGuardDeps(session: VerifyResult, existing: readonly string[]): AdminGuardDeps {
  return {
    getSessionAdminId: async () => (session.ok ? session.adminId : null),
    adminExists: async (id) => existing.includes(id),
  };
}

export async function buildAdminSessionReport() {
  const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ iss: SESSION_ISSUER, aud: sessionAudience("production"), sub: FAKE.admin, iat: NOW_S, nbf: NOW_S, exp: NOW_S + 60, jti: FAKE.jti, sv: 2 })}.`;
  const good = await goodV2();
  const [h, p, s] = good.split(".");
  const tamperedPayload = b64({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: FAKE.deletedAdmin });
  const rsHeader = b64({ alg: "RS256", typ: "JWT" });

  const fullEnv = { SUPABASE_SERVICE_ROLE_KEY: FAKE.serviceRole, NEXT_PUBLIC_SUPABASE_ANON_KEY: FAKE.anon, CRON_SECRET: FAKE.cron };

  const adversarial: CaseResult[] = [
    secretCase("01-secret-missing", "ADMIN_SESSION_SIGNING_SECRET not set", { ...fullEnv }),
    secretCase("02-secret-empty", "empty string", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "" }),
    secretCase("02b-secret-blank", "whitespace only", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "     " }),
    secretCase("03-secret-short", "too short (12 chars)", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "Ab3$xY9!qR2z" }),
    secretCase("03b-secret-low-entropy", "64 × 'a'", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "a".repeat(64) }),
    secretCase("03c-secret-pattern", "repeated pattern, 48 chars", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "abc123".repeat(8) }),
    secretCase("04-secret-fallback", "old hard-coded fallback string", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "admin-secret-fallback" }),
    secretCase("04b-secret-fallback-padded", "fallback string padded to length", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "admin-secret-fallback-Zr4Tq8Wm2Kx6Lp9Vb1Nc5Hd3" }),
    secretCase("05-secret-is-service-role", "service-role key reused", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: FAKE.serviceRole }),
    secretCase("05a-secret-is-service-role-any-format", "service-role key (non-JWT format) reused", { ...fullEnv, SUPABASE_SERVICE_ROLE_KEY: FAKE.previewSecret, [ADMIN_SESSION_SECRET_ENV]: FAKE.previewSecret }),
    secretCase("05b-secret-is-cron", "CRON_SECRET reused", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: FAKE.cron }),
    secretCase("05c-secret-new-supabase-format", "sb_secret_ key", { ...fullEnv, [ADMIN_SESSION_SECRET_ENV]: "sb_secret_Zr4Tq8Wm2Kx6Lp9Vb1Nc5Hd3Jf7GsYaEiQm" }),
    {
      id: "04c-service-role-is-never-a-session-key",
      title: "service-role key set, session secret missing → no session key at all",
      blocked: adminSessionV2Config(NO_SECRET_ENV).key === null,
      outcome: adminSessionV2Config(NO_SECRET_ENV).secretStatus,
    },
    await tokenCase("04d-fallback-signed-token", "v1 token signed with the old fallback (runtime)", legacyToken(enc("admin-secret-fallback")), (t) => runtime(t)),
    await tokenCase("04e-fallback-signed-v2-no-secret", "v2 token signed with the old fallback, secret missing (runtime)", forge({}, { key: enc("admin-secret-fallback") }), (t) => runtime(t, NO_SECRET_ENV)),
    await tokenCase("05d-service-role-signed-v2", "v2-shaped token signed with the service-role key", forge({}, { key: LEGACY_KEY }), (t) => v2(t)),
    await tokenCase("06-tampered", "payload changed after signing", Promise.resolve(`${h}.${tamperedPayload}.${s}`), (t) => v2(t)),
    await tokenCase("06b-tampered-signature", "signature byte flipped", Promise.resolve(`${h}.${p}.${s.startsWith("A") ? "B" : "A"}${s.slice(1)}`), (t) => v2(t)),
    await tokenCase("07-expired", "verified 1s after exp + skew", goodV2(), (t) => v2(t, "production", PROD_KEY, new Date((NOW_S + SESSION_TTL_SECONDS + 61) * 1000))),
    await tokenCase("07b-lifetime-too-long", "exp 30 days after iat", forge({ exp: NOW_S + 30 * 86400 }), (t) => v2(t)),
    await tokenCase("08-future-iat", "iat 10 min in the future (nbf now)", forge({ iat: NOW_S + 600 }), (t) => v2(t)),
    await tokenCase("08b-future-issued", "token issued 10 min in the future", goodV2("production", PROD_KEY, new Date(NOW.getTime() + 600_000)), (t) => v2(t)),
    await tokenCase("09-wrong-issuer", "iss of another app", forge({ iss: "someone-else" }), (t) => v2(t)),
    await tokenCase("09b-wrong-audience", "aud of another app", forge({ aud: "moz9:member" }), (t) => v2(t)),
    await tokenCase("09c-missing-issuer", "no iss", forge({ iss: undefined }), (t) => v2(t)),
    await tokenCase("10-wrong-alg-hs512", "HS512 with the right key", forge({}, { alg: "HS512" }), (t) => v2(t)),
    await tokenCase("10b-alg-confusion-rs256", "RS256 header over an HMAC signature", Promise.resolve(`${rsHeader}.${p}.${s}`), (t) => v2(t)),
    await tokenCase("10c-v1-hs384", "v1-shaped HS384 token (runtime)", legacyToken(LEGACY_KEY, "HS384"), (t) => runtime(t)),
    await tokenCase("11-unsigned", "alg none, empty signature (v2)", Promise.resolve(unsigned), (t) => v2(t)),
    await tokenCase("11b-unsigned-runtime", "alg none, empty signature (runtime)", Promise.resolve(unsigned), (t) => runtime(t)),
    await tokenCase("12-other-env-same-secret", "preview token in production (same secret)", goodV2("preview", PROD_KEY), (t) => v2(t, "production", PROD_KEY)),
    await tokenCase("12b-other-env-own-secret", "preview token in production (separate secrets)", goodV2("preview", PREVIEW_KEY), (t) => v2(t, "production", PROD_KEY)),
    await tokenCase("12c-local-token-in-production", "local token in production", goodV2("local", PROD_KEY), (t) => v2(t, "production", PROD_KEY)),
    await tokenCase("13-version-1", "sv = 1", forge({ sv: 1 }), (t) => v2(t)),
    await tokenCase("13b-version-string", "sv = \"2\"", forge({ sv: "2" }), (t) => v2(t)),
    await tokenCase("13c-version-missing", "no sv claim", forge({ sv: undefined }), (t) => v2(t)),
    await tokenCase("13d-bad-subject", "sub is not a UUID", forge({ sub: "admin" }), (t) => v2(t)),
  ];

  // 14 / 15 — authorization stays on the server.
  const escalation = await forge({ role: "verifier", authority: "issuer", grants: ["verification.approve", "verification.issue"], admin: true });
  const escalated = await runtime(escalation);
  const escalatedAdmin = await checkAdmin(fakeGuardDeps(escalated, [FAKE.admin]));
  const deleted = await v2(await signAdminSessionV2({ adminId: FAKE.deletedAdmin, key: PROD_KEY, environment: "production", now: NOW, jti: FAKE.jti }));
  adversarial.push(
    {
      id: "14-deleted-admin",
      title: "valid signature, admin row deleted",
      blocked: deleted.ok && (await checkAdmin(fakeGuardDeps(deleted, [FAKE.admin]))) === null,
      outcome: "checkAdmin → null",
    },
    {
      id: "15-claims-escalation",
      title: "role/authority/grants claims in a validly signed token",
      blocked:
        escalated.ok &&
        JSON.stringify(Object.keys(escalated).sort()) === JSON.stringify(["adminId", "ok"]) &&
        JSON.stringify(escalatedAdmin) === JSON.stringify({ adminId: FAKE.admin }),
      outcome: "claims ignored; verifier and checkAdmin return the admin id only",
    },
  );

  // 17 — fail-closed paths.
  const missingCfg = adminSessionV2Config({ ...fullEnv });
  const throwingDeps: AdminGuardDeps = { getSessionAdminId: async () => { throw new Error("boom"); }, adminExists: async () => true };
  const proxyNoKey = adminGateDecision("/admin/site/newsletter", await runtime(good, NO_SECRET_ENV));
  const proxyForged = adminGateDecision("/admin/site/newsletter", await runtime("x"));
  adversarial.push(
    { id: "17-v2-no-key", title: "v2 config with missing secret", blocked: missingCfg.key === null && !(await v2(good, "production", missingCfg.key)).ok, outcome: missingCfg.secretStatus },
    { id: "17b-guard-throws", title: "session reader throws", blocked: (await checkAdmin(throwingDeps)) === null, outcome: "checkAdmin → null" },
    { id: "17c-proxy-no-key", title: "proxy, valid v2 token but secret missing", blocked: proxyNoKey.action === "redirect", outcome: JSON.stringify(proxyNoKey) },
    { id: "17d-proxy-forged-cookie", title: "proxy, cookie admin-token=x (was let through before)", blocked: proxyForged.action === "redirect", outcome: JSON.stringify(proxyForged) },
  );

  // 18 — legacy token policy (option A: one re-login, no legacy acceptance).
  const legacy = await legacyToken();
  const legacyInV2 = await runtime(legacy);
  const legacyInV2OwnKey = await runtime(await legacyToken(PROD_KEY));
  adversarial.push({
    id: "18-legacy-in-v2",
    title: "v1 token (service-role signed / v2-secret signed) at runtime",
    blocked: !legacyInV2.ok && !legacyInV2OwnKey.ok,
    outcome: `${legacyInV2.ok ? "ACCEPTED" : legacyInV2.reason} / ${legacyInV2OwnKey.ok ? "ACCEPTED" : legacyInV2OwnKey.reason}`,
  });

  // v1 → v2 boundary at runtime (what the switch means for existing sessions).
  const compat = {
    v1SessionAcceptedAfterSwitch: (await runtime(legacy)).ok,
    v1CookieNameRead: adminSessionV2Config(PROD_ENV).cookie.name === LEGACY_ADMIN_COOKIE,
    v2SessionAccepted: (await runtime(good)).ok,
    v2SessionAcceptedByProxy: adminGateDecision("/admin", await runtime(good)).action === "next",
    previewSessionAcceptedInProduction: (await runtime(await goodV2("preview", PROD_KEY))).ok,
    v2SessionAcceptedWithoutSecret: (await runtime(good, NO_SECRET_ENV)).ok,
  };

  const proxyGate = [
    ["/admin", "valid"],
    ["/admin", "forged"],
    ["/admin/login", "valid"],
    ["/admin/login", "forged"],
    ["/admin/login", "none"],
  ].map(([path, kind]) => {
    const session: VerifyResult = kind === "valid" ? { ok: true, adminId: FAKE.admin } : { ok: false, reason: kind === "none" ? "NO_TOKEN" : "BAD_SIGNATURE" };
    return { path, session: kind, decision: adminGateDecision(path, session) };
  });

  const redirects = ["/admin/site/newsletter?tab=1", "/admin", "https://evil.example", "//evil.example", "/\\evil.example", "/administrator", "/admin/login", "javascript:alert(1)", ""].map((input) => ({
    input,
    output: safeAdminRedirect(input),
  }));

  const blocked = adversarial.filter((c) => c.blocked).length;
  const report = {
    version: ADMIN_SESSION_VERSION,
    stage: "6-D3b",
    asOf: REPORT_AS_OF,
    fakeOnly: true,
    policy: {
      secretEnv: ADMIN_SESSION_SECRET_ENV,
      algorithm: "HS256 (pinned)",
      issuer: SESSION_ISSUER,
      audience: "moz9:admin:<production|preview|development|local>",
      tokenVersion: 2,
      ttlSeconds: SESSION_TTL_SECONDS,
      requiredClaims: ["iss", "aud", "sub", "iat", "nbf", "exp", "jti", "sv"],
      cookieV1: { name: LEGACY_ADMIN_COOKIE, read: false, expiredOnLoginLogout: expiredLegacyCookie("production").options },
      logoutExpires: expiredCookie(v2CookiePolicy("production")),
      cookieV2: { production: v2CookiePolicy("production"), local: v2CookiePolicy("local") },
      legacyMigration: "A — v2 never accepts v1 tokens; every admin logs in once after the switch",
    },
    summary: { adversarialCases: adversarial.length, blocked, notBlocked: adversarial.filter((c) => !c.blocked).map((c) => c.id), secretsInReport: 0 },
    adversarial,
    compatibility: compat,
    proxyGate,
    redirects,
  };
  const digest = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  return { report: { ...report, digest }, digest };
}
