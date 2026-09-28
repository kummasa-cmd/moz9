// The "발송 일시" (scheduled_at) picker is a plain <input type="datetime-local">,
// which yields a naive "YYYY-MM-DDTHH:mm" string with no timezone info. Since
// admins pick that time in KST (Asia/Seoul, no DST — fixed UTC+9), it must be
// explicitly converted to/from UTC around the timestamptz column instead of
// being passed straight through (which Postgres would otherwise interpret as
// UTC, shifting every scheduled send 9 hours later than intended).
const KST_OFFSET = "+09:00";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// datetime-local value (KST wall-clock) -> UTC ISO string for storage.
export function kstDatetimeLocalToUtcIso(value: string): string {
  return new Date(`${value}:00${KST_OFFSET}`).toISOString();
}

// Stored UTC ISO timestamp -> datetime-local value (KST wall-clock) for
// pre-filling the edit form. Adds the offset and reads UTC getters so the
// result doesn't depend on the server process's own timezone.
export function utcIsoToKstDatetimeLocal(value: string | null): string {
  if (!value) return "";
  const kst = new Date(new Date(value).getTime() + KST_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())}T${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

// KST calendar date ("YYYY-MM-DD") of the given instant. Campaign dates
// (range_start / range_end / last_sent_date) are KST days, so "today" must be
// computed in KST too — a UTC date would treat KST 00:00–08:59 as yesterday.
export function kstDateString(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// KST wall-clock time ("HH:mm:ss") of the given instant, comparable as a
// string against a Postgres `time` column value.
export function kstTimeString(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(11, 19);
}
