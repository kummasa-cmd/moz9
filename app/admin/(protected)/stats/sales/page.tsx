import PageHeader from "@/components/admin/PageHeader";
import StatCard from "@/components/admin/StatCard";
import MiniBarChart from "@/components/admin/MiniBarChart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, TrendingUp, ShoppingCart } from "lucide-react";

const monthly = [
  { label: "1월", value: 4200000, display: "420만원" },
  { label: "2월", value: 5100000, display: "510만원" },
  { label: "3월", value: 4800000, display: "480만원" },
  { label: "4월", value: 6300000, display: "630만원" },
  { label: "5월", value: 7100000, display: "710만원" },
  { label: "6월", value: 8400000, display: "840만원" },
];

const byProduct = [
  { product: "베이직 패키지", count: 9, total: "2,700,000원", share: "18%" },
  { product: "스탠다드 패키지", count: 14, total: "11,200,000원", share: "47%" },
  { product: "프리미엄 패키지", count: 5, total: "7,500,000원", share: "27%" },
  { product: "애드온", count: 11, total: "880,000원", share: "8%" },
];

export default function AdminStatsSalesPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="상품판매현황" description="패키지·애드온별 판매 실적을 확인합니다." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <StatCard label="이번달 매출" value="8,400,000원" icon={Wallet} />
        <StatCard label="전월 대비" value="+18.3%" icon={TrendingUp} />
        <StatCard label="이번달 주문" value="37건" icon={ShoppingCart} />
      </div>

      <div className="rounded-xl border border-border bg-white p-6 mb-6">
        <h3 className="font-semibold text-foreground mb-5">월별 매출</h3>
        <MiniBarChart data={monthly} />
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="p-5 pb-0">
          <h3 className="font-semibold text-foreground mb-4">상품별 판매 현황</h3>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상품명</TableHead>
              <TableHead>판매 건수</TableHead>
              <TableHead>매출액</TableHead>
              <TableHead>비중</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byProduct.map((p) => (
              <TableRow key={p.product}>
                <TableCell className="font-medium">{p.product}</TableCell>
                <TableCell className="text-muted-foreground">{p.count}건</TableCell>
                <TableCell className="text-muted-foreground">{p.total}</TableCell>
                <TableCell className="text-muted-foreground">{p.share}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
