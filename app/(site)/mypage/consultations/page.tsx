import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const statusVariant = (s: string) =>
  s === "완료" ? ("default" as const) : s === "처리중" ? ("secondary" as const) : ("outline" as const);

export default async function ConsultationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: consultations } = await admin
    .from("consultations")
    .select("id, subject, status, admin_reply, created_at")
    .eq("member_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">상담 내역</h1>
        <Link
          href="/mypage/consultations/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          상담 신청
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {consultations && consultations.length > 0 ? (
          <ul className="divide-y divide-border">
            {consultations.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(c.created_at).toLocaleDateString("ko-KR")}
                    </p>
                    {c.admin_reply && (
                      <div className="mt-2 pl-3 border-l-2 border-primary/30">
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">답변</p>
                        <p className="text-xs text-foreground whitespace-pre-wrap">{c.admin_reply}</p>
                      </div>
                    )}
                  </div>
                  <Badge variant={statusVariant(c.status)} className="flex-shrink-0 text-xs">
                    {c.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-16 text-sm text-muted-foreground">
            <p>아직 상담 내역이 없습니다.</p>
            <Link href="/mypage/consultations/new" className="text-primary hover:underline mt-2 inline-block">
              첫 상담을 신청해보세요
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
