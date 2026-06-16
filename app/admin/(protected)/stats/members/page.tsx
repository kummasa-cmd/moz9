import PageHeader from "@/components/admin/PageHeader";
import StatCard from "@/components/admin/StatCard";
import MiniBarChart from "@/components/admin/MiniBarChart";
import { Users, UserPlus, UserMinus } from "lucide-react";

const monthly = [
  { label: "1월", value: 28, display: "28명" },
  { label: "2월", value: 31, display: "31명" },
  { label: "3월", value: 35, display: "35명" },
  { label: "4월", value: 30, display: "30명" },
  { label: "5월", value: 38, display: "38명" },
  { label: "6월", value: 42, display: "42명" },
];

export default function AdminStatsMembersPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="회원가입현황" description="월별 회원 가입 추이를 확인합니다." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="전체 회원" value="1,284명" icon={Users} />
        <StatCard label="이번달 신규" value="42명" hint="전월 대비 +10.5%" icon={UserPlus} />
        <StatCard label="이번달 탈퇴" value="3명" icon={UserMinus} />
      </div>

      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="font-semibold text-foreground mb-5">월별 신규 가입</h3>
        <MiniBarChart data={monthly} />
      </div>
    </div>
  );
}
