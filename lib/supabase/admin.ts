import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS, used only inside server actions for
// privileged operations (creating auth users). Never import from client code.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
