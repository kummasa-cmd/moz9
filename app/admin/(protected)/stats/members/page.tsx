import PageHeader from "@/components/admin/PageHeader";
import StatCard from "@/components/admin/StatCard";
import MiniBarChart from "@/components/admin/MiniBarChart";
import { Users, UserPlus, UserMinus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminStatsMembersPage() {
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from("members")
    .select("id, status, created_at");

  const allMembers = members ?? [];
  const totalCount = allMembers.length;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const thisMonthNew = allMembers.filter(
    (m) => m.created_at?.startsWith(thisMonth)
  ).length;

  const thisMonthLeft = allMembers.filter(
    (m) => m.status === "탈퇴" && m.created_at?.startsWith(thisMonth)
  ).length;

  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthNew = allMembers.filter(
    (m) => m.created_at?.startsWith(lastMonthKey)
  ).length;

  const growthRate =
    lastMonthNew > 0
      ? (((thisMonthNew - lastMonthNew) / lastMonthNew) * 100).toFixed(1)
      : null;
  const growthHint = growthRate
    ? `전월 대비 ${Number(growthRate) >= 0 ? "+" : ""}${growthRate}%`
    : undefined;

  const monthly: { label: string; value: number; display: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const count = allMembers.filter((m) => m.created_at?.startsWith(key)).length;
    monthly.push({
      label: `${d.getMonth() + 1}월`,
      value: count,
      display: `${count}명`,
    });
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title="회원가입현황" description="월별 회원 가입 추이를 확인합니다." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="전체 회원"
          value={`${totalCount.toLocaleString()}명`}
          icon={Users}
        />
        <StatCard
          label="이번달 신규"
          value={`${thisMonthNew}명`}
          hint={growthHint}
          icon={UserPlus}
        />
        <StatCard
          label="이번달 탈퇴"
          value={`${thisMonthLeft}명`}
          icon={UserMinus}
        />
      </div>

      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="font-semibold text-foreground mb-5">월별 신규 가입</h3>
        <MiniBarChart data={monthly} />
      </div>
    </div>
  );
}
