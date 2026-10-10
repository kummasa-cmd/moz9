import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { adminSessionV2Config, verifyAdminSessionCookie } from "./config";
import { expiredCookie, expiredLegacyCookie, LEGACY_ADMIN_COOKIE, v2CookiePolicy } from "./cookie";
import { adminGateDecision } from "./proxy-gate";
import { DEFAULT_ADMIN_REDIRECT, safeAdminRedirect } from "./redirect";
import { buildAdminSessionReport, FAKE, NOW } from "./report";
import { ADMIN_SESSION_SECRET_ENV, checkAdminSessionSecret, MIN_SECRET_LENGTH } from "./secret";
import { SignJWT } from "jose";
import {
  CLOCK_SKEW_SECONDS,
  resolveSessionEnvironment,
  signAdminSessionV2,
  verifyAdminSessionV2,
} from "./token";

const ROOT = process.cwd();
const KEY = new TextEncoder().encode(FAKE.prodSecret);
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : sourceFiles(path);
    return /\.(ts|tsx|mjs|js)$/.test(name) ? [path] : [];
  });
}
const rel = (p: string) => relative(ROOT, p).split(sep).join("/");
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;
const files = ["app", "components", "lib"].flatMap((d) => sourceFiles(join(ROOT, d)));

describe("admin-session-v2 security report (adversarial 1–18)", () => {
  it("blocks every adversarial case", async () => {
    const { report } = await buildAdminSessionReport();
    assert.deepEqual(report.summary.notBlocked, []);
    assert.equal(report.summary.blocked, report.adversarial.length);
    // every numbered category of the Stage brief except 16 (client bundle — source checks below)
    const categories = new Set(report.adversarial.map((c) => c.id.slice(0, 2)));
    for (const n of ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "17", "18"]) assert.ok(categories.has(n), n);
  });

  it("is deterministic", async () => {
    const a = await buildAdminSessionReport();
    const b = await buildAdminSessionReport();
    assert.equal(a.digest, b.digest);
  });

  it("contains no secret value", async () => {
    const text = JSON.stringify((await buildAdminSessionReport()).report);
    for (const v of [FAKE.prodSecret, FAKE.previewSecret, FAKE.serviceRole, FAKE.anon, FAKE.cron]) assert.ok(!text.includes(v));
    assert.ok(!/eyJ[\w-]+\.eyJ/.test(text), "no JWT in report");
  });

  it("accepts v2 only: v1 sessions, other environments and a missing secret are refused", async () => {
    const { compatibility } = (await buildAdminSessionReport()).report;
    assert.deepEqual(compatibility, {
      v1SessionAcceptedAfterSwitch: false,
      v1CookieNameRead: false,
      v2SessionAccepted: true,
      v2SessionAcceptedByProxy: true,
      previewSessionAcceptedInProduction: false,
      v2SessionAcceptedWithoutSecret: false,
    });
  });
});

describe("dedicated secret", () => {
  const env = (secret: string | undefined, extra: Record<string, string> = {}) => ({ [ADMIN_SESSION_SECRET_ENV]: secret, ...extra });

  it("accepts a long random value", () => {
    const c = checkAdminSessionSecret(env(FAKE.prodSecret, { SUPABASE_SERVICE_ROLE_KEY: FAKE.serviceRole }));
    assert.equal(c.ok, true);
  });

  it("enforces the minimum length at the boundary", () => {
    const ok = FAKE.prodSecret.slice(0, MIN_SECRET_LENGTH);
    assert.equal(checkAdminSessionSecret(env(ok)).ok, true);
    assert.equal(checkAdminSessionSecret(env(ok.slice(1))).ok, false);
  });

  it("rejects reuse of a public value (anon key) or any other variable", () => {
    const c = checkAdminSessionSecret(env(FAKE.prodSecret, { SOME_WEBHOOK_SECRET: FAKE.prodSecret }));
    assert.equal(c.ok, false);
    assert.equal(!c.ok && c.reason, "REUSES_OTHER_SECRET");
  });

  it("rejects leading/trailing whitespace instead of trimming it", () => {
    const c = checkAdminSessionSecret(env(` ${FAKE.prodSecret}`));
    assert.equal(!c.ok && c.reason, "WHITESPACE");
  });

  it("never puts the value in the rejection detail", () => {
    const value = "abc123".repeat(8);
    const c = checkAdminSessionSecret(env(value));
    assert.ok(!c.ok && !c.detail.includes(value));
  });

  it("v2 config fails closed without a secret", () => {
    const cfg = adminSessionV2Config({ VERCEL_ENV: "production" });
    assert.equal(cfg.key, null);
    assert.equal(cfg.secretStatus, "MISSING");
    assert.equal(cfg.environment, "production");
  });
});

describe("v2 token", () => {
  it("round-trips the admin id and nothing else", async () => {
    const token = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production", now: NOW });
    assert.deepEqual(await verifyAdminSessionV2({ token, key: KEY, environment: "production", now: NOW }), { ok: true, adminId: FAKE.admin });
  });

  it("uses a fresh jti per session", async () => {
    const a = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production", now: NOW });
    const b = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production", now: NOW });
    assert.notEqual(a, b);
  });

  it("tolerates small clock skew but not more", async () => {
    const token = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production", now: new Date(NOW.getTime() + (CLOCK_SKEW_SECONDS - 5) * 1000) });
    assert.equal((await verifyAdminSessionV2({ token, key: KEY, environment: "production", now: NOW })).ok, true);
  });

  it("refuses to sign without a key or for a non-UUID subject", async () => {
    await assert.rejects(signAdminSessionV2({ adminId: FAKE.admin, key: new Uint8Array(), environment: "production" }));
    await assert.rejects(signAdminSessionV2({ adminId: "admin", key: KEY, environment: "production" }));
  });

  it("rejects missing / garbage tokens", async () => {
    for (const token of [undefined, null, "", "x", "a.b.c", "....."]) {
      assert.equal((await verifyAdminSessionV2({ token, key: KEY, environment: "production", now: NOW })).ok, false);
    }
  });

  it("binds the audience to VERCEL_ENV", () => {
    assert.equal(resolveSessionEnvironment({ VERCEL_ENV: "production" }), "production");
    assert.equal(resolveSessionEnvironment({ VERCEL_ENV: "preview" }), "preview");
    assert.equal(resolveSessionEnvironment({ NODE_ENV: "production" }), "local");
    assert.equal(resolveSessionEnvironment({ VERCEL_ENV: "prod" }), "local");
  });
});

describe("session cookie verifier (shared by admin-auth and the proxy)", () => {
  const PROD_ENV = { VERCEL_ENV: "production", [ADMIN_SESSION_SECRET_ENV]: FAKE.prodSecret, SUPABASE_SERVICE_ROLE_KEY: FAKE.serviceRole };
  const v1Token = (secret: string) =>
    new SignJWT({ sub: FAKE.admin }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("24h").sign(new TextEncoder().encode(secret));

  it("accepts a v2 session issued for the same environment", async () => {
    const token = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production" });
    assert.deepEqual(await verifyAdminSessionCookie(token, PROD_ENV), { ok: true, adminId: FAKE.admin });
  });

  it("rejects v1 tokens (service-role signed, v2-secret signed or fallback signed)", async () => {
    for (const secret of [FAKE.serviceRole, FAKE.prodSecret, "admin-secret-fallback"]) {
      assert.equal((await verifyAdminSessionCookie(await v1Token(secret), PROD_ENV)).ok, false, secret.slice(0, 12));
    }
  });

  it("fails closed when the secret is missing or rejected", async () => {
    const token = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "production" });
    for (const env of [
      { VERCEL_ENV: "production" },
      { VERCEL_ENV: "production", [ADMIN_SESSION_SECRET_ENV]: "" },
      { VERCEL_ENV: "production", [ADMIN_SESSION_SECRET_ENV]: FAKE.prodSecret, OTHER_SECRET: FAKE.prodSecret },
    ]) {
      assert.deepEqual(await verifyAdminSessionCookie(token, env), { ok: false, reason: "NO_KEY" });
    }
  });

  it("rejects a session issued for another environment, even with the same secret", async () => {
    const preview = await signAdminSessionV2({ adminId: FAKE.admin, key: KEY, environment: "preview" });
    assert.deepEqual(await verifyAdminSessionCookie(preview, PROD_ENV), { ok: false, reason: "BAD_AUDIENCE" });
  });
});

describe("cookies", () => {
  it("the v1 cookie is never the session cookie and is only ever expired", () => {
    for (const e of ["production", "preview", "development", "local"] as const) assert.notEqual(v2CookiePolicy(e).name, LEGACY_ADMIN_COOKIE);
    assert.deepEqual(expiredLegacyCookie("production"), {
      name: "admin-token",
      options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 },
    });
    assert.equal(expiredLegacyCookie("local").options.secure, false);
  });

  it("logout expires the __Host- cookie with the attributes it was set with", () => {
    const c = expiredCookie(v2CookiePolicy("production"));
    assert.equal(c.name, "__Host-moz9-admin-session");
    assert.deepEqual(c.options, { ...v2CookiePolicy("production").options, maxAge: 0 });
  });

  it("v2 uses __Host- (Secure, Path=/, no Domain) on every deployed environment", () => {
    for (const e of ["production", "preview", "development"] as const) {
      const c = v2CookiePolicy(e);
      assert.ok(c.name.startsWith("__Host-"));
      assert.equal(c.options.secure, true);
      assert.equal(c.options.path, "/");
      assert.equal(c.options.httpOnly, true);
      assert.ok(!("domain" in c.options));
    }
    assert.equal(v2CookiePolicy("local").options.secure, false);
    assert.ok(!v2CookiePolicy("local").name.startsWith("__Host-"));
  });
});

describe("proxy gate", () => {
  const ok = { ok: true as const, adminId: FAKE.admin };
  const bad = { ok: false as const, reason: "BAD_SIGNATURE" as const };
  it("sends unverified sessions to login and keeps the requested path", () => {
    assert.deepEqual(adminGateDecision("/admin/site/newsletter", bad), { action: "redirect", to: "login", from: "/admin/site/newsletter" });
  });
  it("lets verified sessions through", () => {
    assert.deepEqual(adminGateDecision("/admin/sns-lab", ok), { action: "next" });
  });
  it("always shows the login page (no redirect loop)", () => {
    assert.deepEqual(adminGateDecision("/admin/login", bad), { action: "next" });
    // always rendered (Stage 6-D3a): bouncing to /admin looped for a deleted admin with a valid signature
    assert.deepEqual(adminGateDecision("/admin/login", ok), { action: "next" });
  });
});

describe("post-login redirect", () => {
  it("keeps same-site admin paths", () => {
    for (const p of ["/admin", "/admin/site/newsletter", "/admin/sns-lab?x=1", "/admin#top"]) assert.equal(safeAdminRedirect(p), p);
  });
  it("drops everything else", () => {
    for (const p of ["https://evil.example/admin", "//evil.example", "/\\evil.example", "/admin\\..\\x", "/administrator", "/", "/mypage", "javascript:alert(1)", "/admin/login", "/admin/login?redirect=//x", "/admin\n", null, undefined, 42, "/admin/" + "a".repeat(600)]) {
      assert.equal(safeAdminRedirect(p), DEFAULT_ADMIN_REDIRECT, String(p));
    }
  });
});

describe("client bundle boundary (adversarial 16)", () => {
  it("no client component imports the admin session modules or the service-role client", () => {
    const offenders = files
      .filter((p) => USE_CLIENT.test(readFileSync(p, "utf8")))
      .filter((p) => /["']@\/lib\/(?:admin-auth|admin-session\/[\w-]+|supabase\/admin)["']/.test(readFileSync(p, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });

  it("lib/admin-session has no client module and reads no process.env", () => {
    for (const p of sourceFiles(join(ROOT, "lib", "admin-session")).filter((f) => !f.endsWith(".test.ts"))) {
      const src = readFileSync(p, "utf8");
      assert.ok(!USE_CLIENT.test(src), rel(p));
      assert.ok(!/process\.env/.test(src), `${rel(p)} must take env as an argument`);
    }
  });

  it("no public variant of the session secret exists", () => {
    const offenders = files.filter((p) => /NEXT_PUBLIC_[A-Z_]*(?:ADMIN|SESSION|SERVICE_ROLE)/.test(readFileSync(p, "utf8"))).map(rel);
    assert.deepEqual(offenders, []);
  });

  it("the old fallback string is gone from runtime code", () => {
    const allowed = new Set(["lib/admin-session/secret.ts", "lib/admin-session/report.ts", "lib/admin-session/admin-session.test.ts", "lib/admin-guard.test.ts"]);
    const offenders = [...files, join(ROOT, "proxy.ts")].filter((p) => !allowed.has(rel(p)) && readFileSync(p, "utf8").includes("admin-secret-fallback")).map(rel);
    assert.deepEqual(offenders, []);
  });
});

describe("wiring (regression)", () => {
  it("lib/admin-auth.ts: v2 only, dedicated secret, fails closed", () => {
    const src = read("lib/admin-auth.ts");
    assert.ok(!src.includes("SUPABASE_SERVICE_ROLE_KEY"), "the service-role key never signs or verifies a session");
    assert.ok(src.includes("verifyAdminSessionCookie("));
    assert.ok(src.includes("signAdminSessionV2("));
    assert.ok(!src.includes("jwtVerify("), "verification goes through lib/admin-session only");
    assert.ok(/if \(!config\.key\) throw new AdminSessionConfigError/.test(src), "signing fails closed");
    assert.ok(src.includes("expiredLegacyCookie("), "login/logout expire the v1 cookie");
  });

  it("proxy verifies the signature instead of checking cookie presence", () => {
    const src = read("lib/supabase/middleware.ts");
    assert.ok(src.includes("verifyAdminSessionCookie("));
    assert.ok(src.includes("adminGateDecision("));
    assert.ok(!/cookies\.has\(/.test(src));
  });

  it("login sanitises the redirect target", () => {
    assert.ok(read("app/admin/login/actions.ts").includes("safeAdminRedirect(formData.get(\"redirect\"))"));
  });

  it("login fails closed with a generic message and logs only the reason code", () => {
    const src = read("app/admin/login/actions.ts");
    assert.ok(src.includes("error instanceof AdminSessionConfigError"));
    assert.ok(src.includes("${error.reason}"));
    assert.ok(!/console\.\w+\([^)]*(?:process\.env|error\.message)/.test(src));
  });

  it("the shared admin guard reads the session through getAdminSession", () => {
    assert.ok(read("lib/admin-guard.ts").includes("getSessionAdminId: () => getAdminSession()"));
  });

  it("SNS LAB checkAdmin is the shared guard (when SNS LAB is present)", { skip: !existsSync(join(ROOT, "lib/sns-lab/guard.ts")) }, () => {
    assert.ok(read("lib/sns-lab/guard.ts").includes('from "@/lib/admin-guard"'));
  });

  it("cron and webhook routes are independent of the admin session", () => {
    const routes = sourceFiles(join(ROOT, "app", "api", "cron")).concat(sourceFiles(join(ROOT, "app", "api", "webhooks")));
    assert.ok(routes.length >= 4);
    for (const p of routes) {
      const src = readFileSync(p, "utf8");
      assert.ok(!/admin-auth|admin-session|getAdminSession/.test(src), rel(p));
    }
  });

  it("v1 verification is gone from runtime code (no service-role signed session is accepted)", () => {
    const offenders = [...files, join(ROOT, "proxy.ts")]
      .filter((p) => !rel(p).endsWith(".test.ts"))
      .filter((p) => /verifyLegacyAdminToken|legacyAdminSessionKey|legacyCookiePolicy/.test(readFileSync(p, "utf8")))
      .map(rel);
    assert.deepEqual(offenders, []);
  });

  it("only lib/admin-auth.ts, the proxy and the login action use the session modules", () => {
    const users = files
      .filter((p) => !rel(p).startsWith("lib/admin-session/") && !rel(p).endsWith(".test.ts"))
      .filter((p) => /admin-session\/(?:config|token|cookie)["']|signAdminSessionV2|verifyAdminSessionV2/.test(readFileSync(p, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(users, ["app/admin/login/actions.ts", "lib/admin-auth.ts", "lib/supabase/middleware.ts"]);
  });
});
