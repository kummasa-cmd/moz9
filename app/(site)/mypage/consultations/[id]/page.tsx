import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const statusVariant = (s: string) =>
  s === "답변완료" ? ("default" as const) : ("destructive" as const);

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ConsultationDetailPage({ params }: Props) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: consultation } = await admin
    .from("consultations")
    .select("id, subject, message, status, admin_reply, created_at")
    .eq("id", id)
    .eq("member_id", user!.id)
    .maybeSingle();

  if (!consultation) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/consultations" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">상담 내역</h1>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-5 border-b border-border">
          <div className="min-w-0">
            <p className="text-base font-semibold text-foreground">{consultation.subject}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(consultation.created_at).toLocaleDateString("ko-KR")}
            </p>
          </div>
          <Badge variant={statusVariant(consultation.status)} className="flex-shrink-0 text-xs">
            {consultation.status}
          </Badge>
        </div>

        <p className="text-sm text-foreground whitespace-pre-wrap">{consultation.message}</p>

        {consultation.admin_reply && (
          <div className="pt-5 border-t border-border">
            <p className="text-xs font-semibold text-primary mb-2">모즈나인 답변</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{consultation.admin_reply}</p>
          </div>
        )}
      </div>
    </div>
  );
}
