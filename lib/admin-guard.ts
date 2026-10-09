// Admin authorization guard for every admin entry point. SERVER-ONLY.
//
// proxy.ts verifies the admin-token signature before /admin requests, and the
// (protected) layout checks it when a page renders — but neither is enough on
// its own: a Server Action runs without the layout, and an entry point must
// not depend on the proxy matcher. So every admin entry point verifies the
// session itself, as its FIRST statement:
//
//   - admin Server Actions:   await requireAdmin();
//   - admin route handlers:   const auth = await requireAdminForRoute(); if (!auth.ok) return auth.response;
//
// lib/admin-guard.coverage.test.ts fails `npm test` when an admin Server
// Action or route handler is missing its guard or its policy entry.
//
// What "admin" means here: a session whose JWT signature and expiry verify
// (lib/admin-auth.ts → lib/admin-session/token.ts, HS256 pinned, no fallback)
// AND whose admins row still exists — so a deleted admin's token stops
// working immediately instead of at expiry. The project has a single admin
// tier; this guard grants nothing beyond "is an admin". SNS LAB verification
// approve/issue rights are separate (lib/sns-lab/authority) and never derive
// from this check alone.

import { redirect, unstable_rethrow } from "next/navigation";
import { getAdminSession } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export class AdminUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AdminUnauthorizedError";
  }
}

export type AdminGuardDeps = {
  /** Admin id from a signature-verified session, or null. */
  getSessionAdminId(): Promise<string | null>;
  /** Whether the admin still exists. Must return false (not throw) on failure. */
  adminExists(adminId: string): Promise<boolean>;
};

export const defaultAdminGuardDeps: AdminGuardDeps = {
  getSessionAdminId: () => getAdminSession(),
  async adminExists(adminId) {
    try {
      const { data, error } = await createAdminClient()
        .from("admins")
        .select("id")
        .eq("id", adminId)
        .maybeSingle();
      return !error && data !== null;
    } catch {
      return false;
    }
  },
};

/** Returns the verified admin, or null. Never throws for auth failures. */
export async function checkAdmin(deps: AdminGuardDeps = defaultAdminGuardDeps): Promise<{ adminId: string } | null> {
  let adminId: string | null;
  try {
    adminId = await deps.getSessionAdminId();
  } catch (error) {
    // Next.js signals (dynamic rendering bail-out from cookies(), redirect…)
    // must propagate — swallowing them would let the build prerender admin
    // pages statically. Anything else is an auth failure.
    unstable_rethrow(error);
    return null;
  }
  if (!adminId) return null;
  if (!(await deps.adminExists(adminId))) return null;
  return { adminId };
}

/** Where a failed check sends the browser. Generic message: no detail about why. */
export const ADMIN_REAUTH_PATH = `/admin/login?error=${encodeURIComponent("로그인이 필요합니다. 다시 로그인해 주세요.")}`;

/**
 * For admin Server Actions and pages. On failure it never returns: by
 * default it redirects to the login page (redirect() throws, so nothing after
 * this call runs); with `onFail: "throw"` it throws AdminUnauthorizedError.
 */
export async function requireAdmin(
  options: { deps?: AdminGuardDeps; onFail?: "redirect" | "throw" } = {},
): Promise<{ adminId: string }> {
  const admin = await checkAdmin(options.deps);
  if (admin) return admin;
  if (options.onFail === "throw") throw new AdminUnauthorizedError();
  redirect(ADMIN_REAUTH_PATH);
}

/** For admin route handlers: the admin, or a 401 JSON response to return. */
export async function requireAdminForRoute(
  deps: AdminGuardDeps = defaultAdminGuardDeps,
): Promise<{ ok: true; adminId: string } | { ok: false; response: Response }> {
  const admin = await checkAdmin(deps);
  if (admin) return { ok: true, adminId: admin.adminId };
  return { ok: false, response: Response.json({ error: "관리자 로그인이 필요합니다." }, { status: 401 }) };
}
