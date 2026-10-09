// Who may upload a board image (/api/board-image). SERVER-ONLY.
//
// The editor that uses this endpoint (components/RichEditor.tsx) is shown to
// admins (board / newsletter admin) AND to logged-in members (community posts,
// mypage column / partner posts) — so the policy is "a verified admin, or an
// authenticated member who has not withdrawn" (the same member rule proxy.ts
// applies to /mypage). Anonymous uploads are rejected.

import { unstable_rethrow } from "next/navigation";
import { checkAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type UploaderDeps = {
  isAdmin(): Promise<boolean>;
  /** Supabase Auth user id of the request, or null. Must not throw. */
  memberUserId(): Promise<string | null>;
  /** Whether that user has a members row that is not withdrawn. Must not throw. */
  memberActive(userId: string): Promise<boolean>;
};

export const defaultUploaderDeps: UploaderDeps = {
  isAdmin: async () => (await checkAdmin()) !== null,
  async memberUserId() {
    try {
      const { data } = await (await createClient()).auth.getUser();
      return data.user?.id ?? null;
    } catch (error) {
      unstable_rethrow(error);
      return null;
    }
  },
  async memberActive(userId) {
    try {
      const { data, error } = await createAdminClient()
        .from("members")
        .select("status")
        .eq("user_id", userId)
        .maybeSingle();
      return !error && data !== null && data.status !== "탈퇴";
    } catch {
      return false;
    }
  },
};

export async function canUploadBoardImage(deps: UploaderDeps = defaultUploaderDeps): Promise<boolean> {
  if (await deps.isAdmin()) return true;
  const userId = await deps.memberUserId();
  return userId !== null && (await deps.memberActive(userId));
}
