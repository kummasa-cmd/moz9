// Admin session signing secret (admin-session-v2). SERVER-ONLY.
//
// The admin session JWT used to be signed with SUPABASE_SERVICE_ROLE_KEY, with
// a hard-coded string as fallback when that variable was missing. v2 uses a
// dedicated secret, ADMIN_SESSION_SIGNING_SECRET, validated here. Every
// failure is fail-closed: there is no fallback value, and a rejected secret
// means "no admin session can be issued or accepted".
//
// The secret value is never returned in an error, logged or put in a report —
// only the reason code.

export const ADMIN_SESSION_SECRET_ENV = "ADMIN_SESSION_SIGNING_SECRET";

/** ≥ 43 chars ≈ 32 random bytes in base64url (`openssl rand -base64 32`). */
export const MIN_SECRET_LENGTH = 43;
/** A random 43-char base64url string has ~35 distinct characters; 16 rejects repeated / patterned strings. */
export const MIN_DISTINCT_CHARS = 16;

/** Values that must never sign a session (old fallback and common placeholders). */
const KNOWN_WEAK = ["admin-secret-fallback", "changeme", "change-me", "secret", "password", "your-secret-here", "replace-me", "xxxxxxxx"];

export type SecretRejection =
  | "MISSING"
  | "EMPTY"
  | "WHITESPACE"
  | "TOO_SHORT"
  | "LOW_ENTROPY"
  | "KNOWN_WEAK"
  | "LOOKS_LIKE_SUPABASE_KEY"
  | "REUSES_OTHER_SECRET";

export type SecretCheck =
  | { ok: true; key: Uint8Array }
  | { ok: false; reason: SecretRejection; detail: string };

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Validates ADMIN_SESSION_SIGNING_SECRET from `env`. Pure (no global env
 * access) so every case is testable with fake values.
 */
export function checkAdminSessionSecret(env: Env): SecretCheck {
  const value = env[ADMIN_SESSION_SECRET_ENV];
  if (value === undefined) return reject("MISSING", `${ADMIN_SESSION_SECRET_ENV} is not set`);
  if (value.length === 0 || value.trim().length === 0) return reject("EMPTY", `${ADMIN_SESSION_SECRET_ENV} is empty`);
  if (value !== value.trim()) return reject("WHITESPACE", `${ADMIN_SESSION_SECRET_ENV} has leading/trailing whitespace`);

  // Supabase keys (legacy JWT keys "eyJ…", new "sb_secret_" / "sb_publishable_") are not session secrets.
  if (value.startsWith("eyJ") || /^sb_(secret|publishable)_/.test(value)) {
    return reject("LOOKS_LIKE_SUPABASE_KEY", `${ADMIN_SESSION_SECRET_ENV} looks like a Supabase API key`);
  }
  const lower = value.toLowerCase();
  if (KNOWN_WEAK.some((w) => lower.includes(w))) return reject("KNOWN_WEAK", `${ADMIN_SESSION_SECRET_ENV} contains a known placeholder/fallback value`);
  // Reuse of ANY other configured value (service-role key, anon key, cron / webhook secrets, API keys…).
  for (const [name, other] of Object.entries(env)) {
    if (name === ADMIN_SESSION_SECRET_ENV || !other || other.length < 8) continue;
    if (other === value || other.trim() === value) return reject("REUSES_OTHER_SECRET", `${ADMIN_SESSION_SECRET_ENV} equals ${name}`);
  }
  if (value.length < MIN_SECRET_LENGTH) return reject("TOO_SHORT", `${ADMIN_SESSION_SECRET_ENV} is shorter than ${MIN_SECRET_LENGTH} characters`);
  if (new Set(value).size < MIN_DISTINCT_CHARS) return reject("LOW_ENTROPY", `${ADMIN_SESSION_SECRET_ENV} has fewer than ${MIN_DISTINCT_CHARS} distinct characters`);

  return { ok: true, key: new TextEncoder().encode(value) };
}

function reject(reason: SecretRejection, detail: string): SecretCheck {
  return { ok: false, reason, detail };
}
