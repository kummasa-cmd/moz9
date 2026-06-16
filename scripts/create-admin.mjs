// One-off script to register the initial moz9 admin account.
// Usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password> <name>
import { createClient } from "@supabase/supabase-js";

const [email, password, name] = process.argv.slice(2);

if (!email || !password) {
  console.error("Usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password> [name]");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: created, error: authError } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (authError) {
  console.error("Failed to create auth user:", authError.message);
  process.exit(1);
}

const { error: profileError } = await supabase
  .from("admin_profiles")
  .insert({ id: created.user.id, name: name || email, email, role: "최고관리자" });

if (profileError) {
  console.error("Auth user created, but admin_profiles insert failed:", profileError.message);
  process.exit(1);
}

console.log(`Admin created: ${email} (${created.user.id})`);
