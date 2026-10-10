import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { ADMIN_REAUTH_PATH, AdminUnauthorizedError, checkAdmin, requireAdmin, requireAdminForRoute, type AdminGuardDeps } from "./admin-guard";
import { adminSessionV2Config, verifyAdminSessionCookie } from "./admin-session/config";
import { expiredCookie, expiredLegacyCookie, LEGACY_ADMIN_COOKIE } from "./admin-session/cookie";
import { adminGateDecision } from "./admin-session/proxy-gate";
import { signAdminSessionV2, type SessionEnvironment } from "./admin-session/token";
import { canUploadBoardImage, type UploaderDeps } from "./uploads/uploader-auth";
import { checkImageFile, handleImageUpload, MAX_IMAGE_BYTES, sniffImageType, type ImageStorage } from "./uploads/image-upload";

// Admin guard against the REAL session verifier (admin-session-v2 since
// Stage 6-D3b) with FAKE secrets — the same verifyAdminSessionCookie() that
// lib/admin-auth.ts and the proxy use.

const enc = (s: string) => new TextEncoder().encode(s);
const SECRET = "TEST-ONLY-prod-k9Qv2xLm7RtZp4Wc8Yb3Nd6Hf1Js5GaUeXo";
const SERVICE_ROLE = "eyJhbGciOiJIUzI1NiJ9.TEST-ONLY-fake-service-role.c2ln";
const ENV = { ADMIN_SESSION_SIGNING_SECRET: SECRET, VERCEL_ENV: "production", SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE };
const KEY = enc(SECRET);
const OTHER_KEY = enc("TEST-ONLY-attacker-key-Qm3Rv7Tx1Wz5Yb9Kd2Lf6Nh8Pj4Sg");
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const DELETED = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff";
const NOW = new Date("2026-10-09T00:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

/** What lib/admin-auth.ts createAdminSession issues now. */
const v2Token = (sub: string, o: { key?: Uint8Array; environment?: SessionEnvironment; now?: Date } = {}) =>
  signAdminSessionV2({ adminId: sub, key: o.key ?? KEY, environment: o.environment ?? "production", now: o.now ?? NOW });
/** What the previous (v1) code issued: { sub, exp } signed with the service-role key. */
const v1Token = (sub: string, key = enc(SERVICE_ROLE), exp = NOW_S + 86400) => new SignJWT({ sub }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(exp).sign(key);

type Env = Record<string, string | undefined>;
const verify = (cookie: string | undefined, env: Env = ENV) => verifyAdminSessionCookie(cookie, env, NOW);

/** Guard deps whose session comes from the real verifier on a cookie value. */
function depsFor(cookie: string | undefined, existing = [ADMIN], env: Env = ENV): AdminGuardDeps & { existsCalls: string[] } {
  const existsCalls: string[] = [];
  return {
    existsCalls,
    async getSessionAdminId() {
      const r = await verify(cookie, env);
      return r.ok ? r.adminId : null;
    },
    async adminExists(id) {
      existsCalls.push(id);
      return existing.includes(id);
    },
  };
}

const unsigned = () => `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: ADMIN, exp: NOW_S + 60 })).toString("base64url")}.`;

describe("checkAdmin with the real v2 verifier", () => {
  it("no cookie", async () => assert.equal(await checkAdmin(depsFor(undefined)), null));
  it("garbage cookie (admin-token=x style)", async () => assert.equal(await checkAdmin(depsFor("x")), null));
  it("forged signature", async () => assert.equal(await checkAdmin(depsFor(await v2Token(ADMIN, { key: OTHER_KEY }))), null));
  it("signed with the service-role key", async () => assert.equal(await checkAdmin(depsFor(await v2Token(ADMIN, { key: enc(SERVICE_ROLE) }))), null));
  it("signed with the old hard-coded fallback", async () => assert.equal(await checkAdmin(depsFor(await v2Token(ADMIN, { key: enc("admin-secret-fallback") }))), null));
  it("unsigned (alg none)", async () => assert.equal(await checkAdmin(depsFor(unsigned())), null));
  it("expired", async () => assert.equal(await checkAdmin(depsFor(await v2Token(ADMIN, { now: new Date((NOW_S - 86400 - 120) * 1000) }))), null));
  it("issued for another environment (preview → production)", async () => assert.equal(await checkAdmin(depsFor(await v2Token(ADMIN, { environment: "preview" }))), null));
  it("v1 session (service-role signed, issued before 6-D3b) is rejected", async () => {
    assert.equal(await checkAdmin(depsFor(await v1Token(ADMIN))), null);
    assert.equal(await checkAdmin(depsFor(await v1Token(ADMIN, KEY))), null, "even when signed with the v2 secret");
  });
  it("secret missing / empty / weak / reused → nobody is authenticated", async () => {
    const token = await v2Token(ADMIN);
    const envs: Env[] = [{ VERCEL_ENV: "production" }, { ...ENV, ADMIN_SESSION_SIGNING_SECRET: "" }, { ...ENV, ADMIN_SESSION_SIGNING_SECRET: "short" }, { ...ENV, ADMIN_SESSION_SIGNING_SECRET: SERVICE_ROLE }];
    for (const env of envs) assert.equal(await checkAdmin(depsFor(token, [ADMIN], env)), null);
  });
  it("unknown adminId (valid signature)", async () => assert.equal(await checkAdmin(depsFor(await v2Token(UNKNOWN))), null));
  it("deleted admin (valid signature)", async () => {
    const d = depsFor(await v2Token(DELETED), [ADMIN]);
    assert.equal(await checkAdmin(d), null);
    assert.deepEqual(d.existsCalls, [DELETED]);
  });
  it("valid v2 session", async () => assert.deepEqual(await checkAdmin(depsFor(await v2Token(ADMIN))), { adminId: ADMIN }));
  it("no session → the admins table is never queried", async () => {
    const d = depsFor("x");
    await checkAdmin(d);
    assert.deepEqual(d.existsCalls, []);
  });
  it("rethrows Next.js dynamic-rendering signals (admin pages must stay dynamic, never prerendered)", async () => {
    await assert.rejects(
      checkAdmin({ getSessionAdminId: async () => { throw new DynamicServerError("cookies() during prerender"); }, adminExists: async () => true }),
      DynamicServerError,
    );
  });
  it("fails closed when the session reader throws", async () => {
    assert.equal(await checkAdmin({ getSessionAdminId: async () => { throw new Error("cookies() outside a request"); }, adminExists: async () => true }), null);
  });
});

describe("requireAdmin / requireAdminForRoute", () => {
  it("redirects to login (and never returns) on failure", async () => {
    await assert.rejects(requireAdmin({ deps: depsFor("x") }), (e: { digest?: string }) => {
      assert.ok(String(e.digest).startsWith("NEXT_REDIRECT;"));
      assert.ok(String(e.digest).includes(ADMIN_REAUTH_PATH));
      return true;
    });
  });
  it("the redirect message reveals nothing about the cause", () => {
    const msg = decodeURIComponent(ADMIN_REAUTH_PATH);
    assert.ok(!/jwt|token|signature|secret|expired|deleted|서명|만료/i.test(msg));
  });
  it("throws AdminUnauthorizedError with onFail: throw", async () => {
    await assert.rejects(requireAdmin({ deps: depsFor(undefined), onFail: "throw" }), AdminUnauthorizedError);
  });
  it("returns the admin for a valid session", async () => {
    assert.deepEqual(await requireAdmin({ deps: depsFor(await v2Token(ADMIN)) }), { adminId: ADMIN });
  });
  it("routes get a 401", async () => {
    const r = await requireAdminForRoute(depsFor(await v2Token(ADMIN, { key: OTHER_KEY })));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.response.status, 401);
  });
});

describe("proxy and login / logout use the same verifier and cookie", () => {
  it("a session issued like createAdminSession passes the proxy", async () => {
    assert.deepEqual(adminGateDecision("/admin/site/newsletter", await verify(await v2Token(ADMIN))), { action: "next" });
  });
  it("forged / missing / expired / v1 / other-env cookies go to login; the login page always renders", async () => {
    const cookies = [undefined, "x", await v2Token(ADMIN, { key: OTHER_KEY }), await v2Token(ADMIN, { now: new Date((NOW_S - 90000) * 1000) }), await v1Token(ADMIN), await v2Token(ADMIN, { environment: "local" })];
    for (const cookie of cookies) {
      assert.equal(adminGateDecision("/admin", await verify(cookie)).action, "redirect");
      assert.deepEqual(adminGateDecision("/admin/login", await verify(cookie)), { action: "next" });
    }
  });
  it("proxy fails closed without a secret", async () => {
    assert.equal(adminGateDecision("/admin", await verify(await v2Token(ADMIN), { VERCEL_ENV: "production" })).action, "redirect");
  });
  it("the proxy reads the v2 cookie, never the v1 one", () => {
    assert.equal(adminSessionV2Config(ENV).cookie.name, "__Host-moz9-admin-session");
    assert.notEqual(adminSessionV2Config(ENV).cookie.name, LEGACY_ADMIN_COOKIE);
  });
  it("logout expires the v2 cookie with matching attributes (__Host- needs Secure + Path=/) and the v1 cookie", () => {
    const cfg = adminSessionV2Config(ENV);
    assert.deepEqual(expiredCookie(cfg.cookie), { name: "__Host-moz9-admin-session", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 } });
    assert.deepEqual(expiredLegacyCookie("production"), { name: "admin-token", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 } });
  });
});

describe("board image uploader policy", () => {
  const deps = (o: Partial<UploaderDeps>): UploaderDeps => ({ isAdmin: async () => false, memberUserId: async () => null, memberActive: async () => false, ...o });
  it("admin → allowed", async () => assert.equal(await canUploadBoardImage(deps({ isAdmin: async () => true })), true));
  it("active member → allowed", async () => assert.equal(await canUploadBoardImage(deps({ memberUserId: async () => "u1", memberActive: async () => true })), true));
  it("withdrawn / unknown member → rejected", async () => assert.equal(await canUploadBoardImage(deps({ memberUserId: async () => "u1" })), false));
  it("anonymous → rejected", async () => assert.equal(await canUploadBoardImage(deps({})), false));
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new Uint8Array([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBP")]);
const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');

describe("image file validation", () => {
  it("detects the real type", () => {
    assert.equal(sniffImageType(PNG), "image/png");
    assert.equal(sniffImageType(JPEG), "image/jpeg");
    assert.equal(sniffImageType(GIF), "image/gif");
    assert.equal(sniffImageType(WEBP), "image/webp");
    assert.equal(sniffImageType(HTML), null);
    assert.equal(sniffImageType(SVG), null);
  });
  it("accepts a real image and derives the extension from its bytes", async () => {
    const r = await checkImageFile(new File([PNG], "../../evil.html", { type: "image/png" }));
    assert.ok(r.ok);
    assert.equal(r.ok && r.ext, "png");
  });
  it("rejects HTML / SVG disguised as images, type mismatch, missing, empty and oversize files", async () => {
    for (const f of [
      new File([HTML], "a.png", { type: "image/png" }),
      new File([SVG], "a.svg", { type: "image/svg+xml" }),
      new File([SVG], "a.png", { type: "image/png" }),
      new File([JPEG], "a.png", { type: "image/png" }),
      new File([PNG], "a.txt", { type: "text/plain" }),
      new File([], "a.png", { type: "image/png" }),
      new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "a.png", { type: "image/png" }),
      null,
      "not a file",
    ]) {
      assert.equal((await checkImageFile(f)).ok, false);
    }
  });
});

describe("handleImageUpload", () => {
  function fakeStorage(fail = false) {
    const calls: { bucket: string; path: string; contentType: string; upsert: boolean }[] = [];
    const storage: ImageStorage = {
      from: (bucket) => ({
        async upload(path, _body, options) {
          calls.push({ bucket, path, ...options });
          return { error: fail ? new Error("boom") : null };
        },
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${path}` } }),
      }),
    };
    return { storage, calls };
  }
  const req = (file: File | null) => {
    const fd = new FormData();
    if (file) fd.set("file", file);
    return new Request("http://localhost/api/x", { method: "POST", body: fd });
  };

  it("stores under a server-generated name with the detected type, never overwriting", async () => {
    const { storage, calls } = fakeStorage();
    const out = await handleImageUpload(req(new File([PNG], "../../../etc/passwd.html", { type: "image/png" })), "board-images", () => storage);
    assert.equal(out.status, 200);
    assert.equal(calls.length, 1);
    assert.match(calls[0].path, /^[0-9a-f-]{36}\.png$/);
    assert.equal(calls[0].contentType, "image/png");
    assert.equal(calls[0].upsert, false);
  });
  it("invalid files are never stored", async () => {
    const { storage, calls } = fakeStorage();
    assert.equal((await handleImageUpload(req(new File([HTML], "a.png", { type: "image/png" })), "b", () => storage)).status, 400);
    assert.equal((await handleImageUpload(req(null), "b", () => storage)).status, 400);
    assert.equal((await handleImageUpload(new Request("http://localhost", { method: "POST", body: "garbage" }), "b", () => storage)).status, 400);
    assert.equal(calls.length, 0);
  });
  it("a storage failure returns 500 without a URL", async () => {
    const { storage } = fakeStorage(true);
    const out = await handleImageUpload(req(new File([JPEG], "a.jpg", { type: "image/jpeg" })), "b", () => storage);
    assert.equal(out.status, 500);
    assert.ok(!("url" in out.body));
  });
});
