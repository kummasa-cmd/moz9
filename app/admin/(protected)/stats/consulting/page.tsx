import PageHeader from "@/components/admin/PageHeader";
import StatCard from "@/components/admin/StatCard";
import MiniBarChart from "@/components/admin/MiniBarChart";
import { MessageSquare, CheckCircle2, Clock } from "lucide-react";

const byChannel = [
  { label: "무료상담", value: 24, display: "24건" },
  { label: "1대1문의", value: 11, display: "11건" },
];

export default function AdminStatsConsultingPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="상담현황" description="채널별 상담·문의 접수 및 답변 현황입니다." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="이번달 전체 문의" value="35건" icon={MessageSquare} />
        <StatCard label="답변완료" value="26건" hint="답변률 74%" icon={CheckCircle2} />
        <StatCard label="미답변" value="9건" icon={Clock} />
      </div>

      <div className="rounded-xl border border-border bg-white p-6">
        <h3 className="font-semibold text-foreground mb-5">채널별 문의 건수</h3>
        <MiniBarChart data={byChannel} />
      </div>
    </div>
  );
}
