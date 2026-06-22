import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessageCircle, ShoppingBag, CreditCard, ArrowRight } from "lucide-react";
import Link from "next/link";

export default async function MypageDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const [{ data: member }, { count: consultationCount }] = await Promise.all([
    admin.from("members").select("nickname, created_at").eq("user_id", user!.id).maybeSingle(),
    admin.from("consultations").select("*", { count: "exact", head: true }).eq("member_id", user!.id),
  ]);

  const joinDate = member?.created_at
    ? new Date(member.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const stats = [
    {
      label: "상담 내역",
      value: consultationCount ?? 0,
      unit: "건",
      href: "/mypage/consultations",
      icon: MessageCircle,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "주문 내역",
      value: 0,
      unit: "건",
      href: "/mypage/orders",
      icon: ShoppingBag,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "결제 내역",
      value: 0,
      unit: "건",
      href: "/mypage/payments",
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-xl border border-border bg-white px-6 py-5">
        <p className="text-sm text-muted-foreground">안녕하세요,</p>
        <h1 className="text-xl font-bold text-foreground mt-0.5">
          {member?.nickname ?? ""}님 <span className="text-muted-foreground font-normal text-base">반갑습니다.</span>
        </h1>
        {joinDate && (
          <p className="text-xs text-muted-foreground mt-1">{joinDate} 가입</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-border bg-white px-5 py-5 hover:shadow-sm transition-shadow group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <s.icon size={18} className={s.color} />
              </div>
              <ArrowRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {s.value.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-1">{s.unit}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="rounded-xl border border-border bg-white px-6 py-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">바로가기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/mypage/consultations/new"
            className="rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:border-primary hover:text-primary transition-colors text-center"
          >
            상담 신청하기
          </Link>
          <Link
            href="/community"
            className="rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:border-primary hover:text-primary transition-colors text-center"
          >
            커뮤니티 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
