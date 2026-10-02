import type { SupabaseClient } from "@supabase/supabase-js";

// Promo targets page "수신거부 해제": deletes do-not-contact entries through
// the SQL function newsletter_admin_delete_suppressions (0031), which only
// removes plain opt-outs (UNSUBSCRIBE) and refuses COMPLAINT / BOUNCE /
// PROVIDER_SUPPRESSED entries and BOUNCED / SUPPRESSED subscribers — the
// same protection as newsletter_admin_set_status (0030). The rule lives in
// SQL only; this just calls it and maps the counts.
//
// No fallback to a direct table delete: if the function is missing (0031
// not applied) nothing is deleted.

export type AdminSuppressionDeleteResult =
  | { ok: true; deleted: number; blocked: number; notFound: number }
  | { ok: false; message: string };

type RpcClient = Pick<SupabaseClient, "rpc">;

function count(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

export async function adminDeleteSuppressions(db: RpcClient, ids: string[]): Promise<AdminSuppressionDeleteResult> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ok: true, deleted: 0, blocked: 0, notFound: 0 };

  const { data, error } = await db.rpc("newsletter_admin_delete_suppressions", { p_ids: unique });
  if (error) return { ok: false, message: `수신거부 해제 실패: ${error.message}` };

  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const result = { deleted: count(row?.deleted), blocked: count(row?.blocked), notFound: count(row?.not_found) };
  if (Object.values(result).some(Number.isNaN)) return { ok: false, message: "수신거부 해제 결과를 해석할 수 없습니다." };
  return { ok: true, ...result };
}

export function blockedSuppressionMessage(blocked: number): string {
  return `반송·스팸 신고·Resend 발송 차단으로 막힌 ${blocked}건은 해제할 수 없습니다. (단순 수신거부만 해제됩니다)`;
}
