// Post-login redirect target. The login form posts back the `redirect` query
// value, so it is user input: only same-site /admin paths are allowed —
// anything else ("https://evil.example", "//evil.example", "/\evil.example",
// "javascript:…") falls back to /admin.

export const DEFAULT_ADMIN_REDIRECT = "/admin";

export function safeAdminRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return DEFAULT_ADMIN_REDIRECT;
  if (!value.startsWith("/admin")) return DEFAULT_ADMIN_REDIRECT;
  if (value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return DEFAULT_ADMIN_REDIRECT;
  // "/admin" itself, or "/admin/…", "/admin?…", "/admin#…" — not "/administrator.evil".
  const rest = value.slice("/admin".length);
  if (rest !== "" && !/^[/?#]/.test(rest)) return DEFAULT_ADMIN_REDIRECT;
  if (value === "/admin/login" || value.startsWith("/admin/login?") || value.startsWith("/admin/login/")) return DEFAULT_ADMIN_REDIRECT;
  return value;
}
