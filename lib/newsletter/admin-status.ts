import type { SupabaseClient } from "@supabase/supabase-js";

// Admin status change on the subscriber list, through the SQL function
// newsletter_admin_set_status (0030): status + suppression change in one
// locked transaction.
//
// Protected rows — suppression COMPLAINT / BOUNCE / PROVIDER_SUPPRESSED, or
// status BOUNCED / SUPPRESSED — are refused ('blocked'): an ordinary admin
// click must not make an address that bounced, complained or is on the
// Resend suppression list look like a recipient again. Lifting one needs a
// separate, explicit operation (not built yet). UNSUBSCRIBE keeps its
// existing rule: the admin may re-subscribe, like the subscriber could on
// the site.
//
// No fallback to a direct table write: if the function is missing (0030 not
// applied) the change fails instead of bypassing the protection.

export const ADMIN_STATUSES = ["SUBSCRIBED", "UNSUBSCRIBED", "BOUNCED"] as const;
export type AdminStatus = (typeof ADMIN_STATUSES)[number];

export type AdminStatusResult =
  | { ok: true; outcome: "updated" | "unchanged"; subscriberId: string }
  | { ok: false; outcome: "blocked" | "not_found" | "error"; message: string };

export const ADMIN_STATUS_BLOCKED_MESSAGE =
  "반송·스팸 신고·Resend 발송 차단 상태인 구독자는 일반 상태 변경으로 바꿀 수 없습니다.";

export function isAdminStatus(value: string): value is AdminStatus {
  return (ADMIN_STATUSES as readonly string[]).includes(value);
}

type RpcClient = Pick<SupabaseClient, "rpc">;

export async function adminSetSubscriberStatus(db: RpcClient, subscriberId: string, status: AdminStatus): Promise<AdminStatusResult> {
  const { data, error } = await db.rpc("newsletter_admin_set_status", {
    p_subscriber_id: subscriberId,
    p_status: status,
  });
  if (error) return { ok: false, outcome: "error", message: `구독자 상태 변경 실패: ${error.message}` };

  const row = (Array.isArray(data) ? data[0] : data) as { outcome?: unknown; subscriber_id?: unknown } | null;
  switch (row?.outcome) {
    case "updated":
    case "unchanged":
      return { ok: true, outcome: row.outcome, subscriberId: typeof row.subscriber_id === "string" ? row.subscriber_id : subscriberId };
    case "blocked":
      return { ok: false, outcome: "blocked", message: ADMIN_STATUS_BLOCKED_MESSAGE };
    case "not_found":
      return { ok: false, outcome: "not_found", message: "구독자를 찾을 수 없습니다." };
    default:
      return { ok: false, outcome: "error", message: "구독자 상태 변경 결과를 해석할 수 없습니다." };
  }
}
