import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { DynamicServerError } from "next/dist/client/components/hooks-server-context";
import { ADMIN_REAUTH_PATH, AdminUnauthorizedError, checkAdmin, requireAdmin, requireAdminForRoute, type AdminGuardDeps } from "./admin-guard";
import { legacyCookiePolicy } from "./admin-session/cookie";
import { adminGateDecision, verifyAdminCookie } from "./admin-session/proxy-gate";
import { legacyAdminSessionKey, verifyLegacyAdminToken } from "./admin-session/token";
import { canUploadBoardImage, type UploaderDeps } from "./uploads/uploader-auth";
import { checkImageFile, handleImageUpload, MAX_IMAGE_BYTES, sniffImageType, type ImageStorage } from "./uploads/image-upload";

// Stage 6-D3a — admin guard against the REAL v1 verifier with FAKE keys.

const enc = (s: string) => new TextEncoder().encode(s);
const KEY = enc("TEST-ONLY-fake-service-role-key-Zr4Tq8Wm2Kx6Lp9Vb1Nc5Hd3");
const OTHER_KEY = enc("TEST-ONLY-attacker-key-Qm3Rv7Tx1Wz5Yb9Kd2Lf6Nh8Pj4Sg");
const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const DELETED = "00000000-0000-4000-8000-0000000000d1";
const UNKNOWN = "00000000-0000-4000-8000-0000000000ff";
const NOW = new Date("2026-10-09T00:00:00Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);

/** Exactly what lib/admin-auth.ts createAdminSession issues. */
const v1Token = (sub: string, key = KEY, exp = NOW_S + 86400) => new SignJWT({ sub }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(exp).sign(key);

/** Guard deps whose session comes from the real verifier on a cookie value. */
function depsFor(cookie: string | undefined, existing = [ADMIN]): AdminGuardDeps & { existsCalls: string[] } {
  const existsCalls: string[] = [];
  return {
    existsCalls,
    async getSessionAdminId() {
      const r = await verifyLegacyAdminToken(cookie, KEY, NOW);
      return r.ok ? r.adminId : null;
    },
    async adminExists(id) {
      existsCalls.push(id);
      return existing.includes(id);
    },
  };
}

describe("checkAdmin with the real v1 verifier (security tests 1–8)", () => {
  it("1 no cookie", async () => assert.equal(await checkAdmin(depsFor(undefined)), null));
  it("2 admin-token=x", async () => assert.equal(await checkAdmin(depsFor("x")), null));
  it("3 forged signature", async () => assert.equal(await checkAdmin(depsFor(await v1Token(ADMIN, OTHER_KEY))), null));
  it("3b old hard-coded fallback secret", async () => assert.equal(await checkAdmin(depsFor(await v1Token(ADMIN, enc("admin-secret-fallback")))), null));
  it("3c unsigned (alg none)", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ sub: ADMIN, exp: NOW_S + 60 })).toString("base64url")}.`;
    assert.equal(await checkAdmin(depsFor(none)), null);
  });
  it("4 expired", async () => assert.equal(await checkAdmin(depsFor(await v1Token(ADMIN, KEY, NOW_S - 1))), null));
  it("5 unknown adminId (valid signature)", async () => assert.equal(await checkAdmin(depsFor(await v1Token(UNKNOWN))), null));
  it("6 deleted admin (valid signature)", async () => {
    const d = depsFor(await v1Token(DELETED), [ADMIN]);
    assert.equal(await checkAdmin(d), null);
    assert.deepEqual(d.existsCalls, [DELETED]);
  });
  it("7 valid v1 session", async () => assert.deepEqual(await checkAdmin(depsFor(await v1Token(ADMIN))), { adminId: ADMIN }));
  it("8 extra claims grant nothing beyond { adminId }", async () => {
    const token = await new SignJWT({ sub: ADMIN, role: "verifier", authority: "issuer", grants: ["verification.issue"] }).setProtectedHeader({ alg: "HS256" }).setExpirationTime(NOW_S + 60).sign(KEY);
    assert.deepEqual(await checkAdmin(depsFor(token)), { adminId: ADMIN });
  });
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
    assert.deepEqual(await requireAdmin({ deps: depsFor(await v1Token(ADMIN)) }), { adminId: ADMIN });
  });
  it("routes get a 401", async () => {
    const r = await requireAdminForRoute(depsFor(await v1Token(ADMIN, OTHER_KEY)));
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.response.status, 401);
  });
});

describe("v1 session compatibility and proxy (login / logout regression)", () => {
  it("a session issued by createAdminSession verifies on every path", async () => {
    const token = await v1Token(ADMIN);
    assert.deepEqual(await verifyLegacyAdminToken(token, KEY, NOW), { ok: true, adminId: ADMIN });
    assert.deepEqual(adminGateDecision("/admin/site/newsletter", await verifyAdminCookie(token, KEY, NOW)), { action: "next" });
  });
  it("the key is SUPABASE_SERVICE_ROLE_KEY with no fallback", () => {
    assert.equal(legacyAdminSessionKey({}), null);
    assert.deepEqual(legacyAdminSessionKey({ SUPABASE_SERVICE_ROLE_KEY: "k".repeat(40) }), enc("k".repeat(40)));
  });
  it("proxy: forged / missing / expired cookies go to login, login page always renders (no loop)", async () => {
    for (const cookie of [undefined, "x", await v1Token(ADMIN, OTHER_KEY), await v1Token(ADMIN, KEY, NOW_S - 1)]) {
      assert.equal(adminGateDecision("/admin", await verifyAdminCookie(cookie, KEY, NOW)).action, "redirect");
      assert.deepEqual(adminGateDecision("/admin/login", await verifyAdminCookie(cookie, KEY, NOW)), { action: "next" });
    }
    assert.deepEqual(adminGateDecision("/admin/login", await verifyAdminCookie(await v1Token(ADMIN), KEY, NOW)), { action: "next" });
  });
  it("proxy fails closed without a key", async () => {
    assert.equal(adminGateDecision("/admin", await verifyAdminCookie(await v1Token(ADMIN), null, NOW)).action, "redirect");
  });
  it("cookie name/options unchanged (logout deletes the same cookie)", () => {
    assert.deepEqual(legacyCookiePolicy("production"), { name: "admin-token", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 86400 } });
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
