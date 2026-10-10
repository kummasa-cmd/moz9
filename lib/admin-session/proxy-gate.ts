// /admin gate run by proxy.ts. SERVER-ONLY.
//
// Before Stage 6-D2 the proxy only checked that an "admin-token" cookie
// EXISTED, and a Server Action runs without the (protected) layout, so any
// cookie value (`admin-token=x`) reached admin actions that did not check the
// session themselves. The proxy now verifies the session with the same
// verifier as lib/admin-auth.ts (lib/admin-session/config.ts
// verifyAdminSessionCookie — admin-session-v2 since Stage 6-D3b). It is the
// OUTER line only: every admin
// Server Action / route handler also calls lib/admin-guard.ts itself
// (Stage 6-D3a).
//
// /admin/login is always shown, even with a valid cookie: the entry points
// also require the admins row to exist, and bouncing a
// valid-signature-but-deleted admin from the login page back to /admin would
// loop between the two.

import type { VerifyResult } from "./token";

export type AdminGateDecision =
  | { action: "next" }
  | { action: "redirect"; to: "login"; from: string };

export function adminGateDecision(pathname: string, session: VerifyResult): AdminGateDecision {
  if (pathname === "/admin/login") return { action: "next" };
  if (!session.ok) return { action: "redirect", to: "login", from: pathname };
  return { action: "next" };
}
