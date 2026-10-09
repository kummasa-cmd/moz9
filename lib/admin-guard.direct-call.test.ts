import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Direct-call test (Stage 6-D3a): every admin Server Action and every
// authenticated upload route is invoked the way an attacker would — directly,
// with no proxy, no layout and no admin session — and must:
//   - stop with the login redirect (actions) / 401 (routes), never succeed
//   - make ZERO outgoing requests: Supabase (DB + Storage) and Resend both go
//     through fetch, so a fetch spy proves "no DB change, no e-mail, no upload,
//     no external API call"
//   - (routes) not even read the request body
//
// Outside a Next.js request, cookies() throws; lib/admin-guard treats that
// exactly like a missing / invalid session (fail-closed), which is the path
// under test. Forged / expired / deleted-admin sessions are covered with the
// real verifier in lib/admin-guard.test.ts.

const ROOT = process.cwd();
const ACTION_MODULES = [
  "app/admin/(protected)/consulting/actions.ts",
  "app/admin/(protected)/consulting/inquiry/actions.ts",
  "app/admin/(protected)/consulting/partner/actions.ts",
  "app/admin/(protected)/members/actions.ts",
  "app/admin/(protected)/orders/actions.ts",
  "app/admin/(protected)/orders/vendors/actions.ts",
  "app/admin/(protected)/portfolio/actions.ts",
  "app/admin/(protected)/products/actions.ts",
  "app/admin/(protected)/site/admins/actions.ts",
  "app/admin/(protected)/site/board/actions.ts",
  "app/admin/(protected)/site/board/[id]/categories/actions.ts",
  "app/admin/(protected)/site/board/[id]/posts/actions.ts",
  "app/admin/(protected)/site/board/[id]/posts/[postId]/actions.ts",
  "app/admin/(protected)/site/main/actions.ts",
  "app/admin/(protected)/site/newsletter/actions.ts",
  "app/admin/(protected)/site/newsletter/banners/actions.ts",
  "app/admin/(protected)/site/newsletter/manage/actions.ts",
  "app/admin/(protected)/site/newsletter/manage/template-actions.ts",
  "app/admin/(protected)/site/newsletter/promo/actions.ts",
  "app/admin/(protected)/site/newsletter/promo/targets/actions.ts",
  "app/admin/(protected)/site/newsletter/subscribers/actions.ts",
  "app/admin/(protected)/site/newsletter/subscribers/test-recipient-actions.ts",
];
const UPLOAD_ROUTES = ["app/api/newsletter-image/route.ts", "app/api/portfolio-image/route.ts", "app/api/board-image/route.ts"];

const FAKE_ID = "00000000-0000-4000-8000-0000000000a1";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

let fetchCalls: string[] = [];
const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };

before(() => {
  // Point every client at an unroutable fake, so even a bug could not reach a real service.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-anon";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-role-key-not-real-0123456789";
  process.env.RESEND_API_KEY = "re_test_only_not_real";
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls.push(String(input instanceof Request ? input.url : input));
    throw new Error("network disabled in test");
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  for (const k of Object.keys(process.env)) if (!(k in savedEnv)) delete process.env[k];
  Object.assign(process.env, savedEnv);
});

const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);

function fakeFormData(): FormData {
  const fd = new FormData();
  for (const k of ["id", "ids", "email", "name", "title", "status", "content", "password", "role", "slug", "subject", "emails", "blocks", "board_id", "post_id"]) fd.set(k, k === "email" ? "attacker@example.com" : FAKE_ID);
  return fd;
}

describe("admin Server Actions called directly without a session", () => {
  let total = 0;
  for (const file of ACTION_MODULES) {
    it(file, async () => {
      const mod = await load(file);
      const fns = Object.entries(mod).filter(([, v]) => typeof v === "function") as [string, (...a: unknown[]) => Promise<unknown>][];
      assert.ok(fns.length > 0);
      for (const [name, fn] of fns) {
        fetchCalls = [];
        const args = Array.from({ length: Math.max(fn.length, 1) }, (_, i) => (i === Math.max(fn.length, 1) - 1 ? fakeFormData() : FAKE_ID));
        let error: unknown = null;
        let resolved = false;
        try {
          await fn(...args);
          resolved = true;
        } catch (e) {
          error = e;
        }
        assert.equal(resolved, false, `${name} completed without a session`);
        const digest = String((error as { digest?: string })?.digest ?? "");
        assert.ok(digest.startsWith("NEXT_REDIRECT;") && digest.includes("/admin/login"), `${name}: expected the login redirect, got ${String(error)}`);
        assert.deepEqual(fetchCalls, [], `${name}: made outgoing requests`);
        total++;
      }
    });
  }
  it("covered every exported action", () => {
    assert.ok(total >= 64, `only ${total} actions exercised`);
  });
});

describe("upload routes called without a session (admin-token=x)", () => {
  for (const file of UPLOAD_ROUTES) {
    it(file, async () => {
      const { POST } = await load(file);
      fetchCalls = [];
      const fd = new FormData();
      fd.set("file", new File([PNG], "x.png", { type: "image/png" }));
      const request = new Request("http://localhost/api/x", { method: "POST", body: fd, headers: { cookie: "admin-token=x" } });
      const response: Response = await POST(request);
      assert.equal(response.status, 401);
      assert.equal(request.bodyUsed, false, "body must not be read before authentication");
      assert.deepEqual(fetchCalls, [], "no storage / DB request");
    });
  }
});
