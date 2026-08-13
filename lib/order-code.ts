import { randomInt } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const RANDOM_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomAlnum(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += RANDOM_CHARS[randomInt(RANDOM_CHARS.length)];
  }
  return out;
}

function todayDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" })
    .format(date)
    .replace(/-/g, "");
}

// Payment reference code: registration date (Asia/Seoul) + 6-char random
// alphanumeric + 4-digit daily sequence, resetting to 0001 each day.
// Format: YYYYMMDD-XXXXXX-0001
export async function generateOrderCode(supabase: SupabaseClient): Promise<string> {
  const dateKey = todayDateKey();

  const { data } = await supabase.from("orders").select("order_code").like("order_code", `${dateKey}-%`);

  const maxSeq = (data ?? []).reduce((max, row) => {
    const seq = Number(String(row.order_code ?? "").slice(-4));
    return Number.isFinite(seq) && seq > max ? seq : max;
  }, 0);

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${dateKey}-${randomAlnum(6)}-${nextSeq}`;
}
