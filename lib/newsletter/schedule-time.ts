// The "발송 일시" (scheduled_at) picker is a plain <input type="datetime-local">,
// which yields a naive "YYYY-MM-DDTHH:mm" string with no timezone info. Since
// admins pick that time in KST (Asia/Seoul, no DST — fixed UTC+9), it must be
// explicitly converted to/from UTC around the timestamptz column instead of
// being passed straight through (which Postgres would otherwise interpret as
// UTC, shifting every scheduled send 9 hours later than intended).
const KST_OFFSET = "+09:00";

// datetime-local value (KST wall-clock) -> UTC ISO string for storage.
export function kstDatetimeLocalToUtcIso(value: string): string {
  return new Date(`${value}:00${KST_OFFSET}`).toISOString();
}

// Stored UTC ISO timestamp -> datetime-local value (KST wall-clock) for
// pre-filling the edit form. Adds the offset and reads UTC getters so the
// result doesn't depend on the server process's own timezone.
export function utcIsoToKstDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const kst = new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}
