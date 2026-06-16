import Link from "next/link";
import { Users, Package, ShoppingCart, MessageSquare } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

function statusVariant(status: string) {
  if (["정상", "결제완료", "답변완료", "판매중"].includes(status)) return "default" as const;
  if (["미답변", "탈퇴"].includes(status)) return "destructive" as const;
  return "secondary" as const;
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();

  const [
    { count: memberCount },
    { count: orderCount },
    { count: consultationCount },
    { count: productCount },
    { data: recentMembers },
    { data: recentOrders },
    { data: recentConsultations },
  ] = await Promise.all([
    supabase.from("members").select("*", { count: "exact", head: true }),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("consultations").select("*", { count: "exact", head: true }).eq("status", "미답변"),
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase
      .from("members")
      .select("name, email, status, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("orders")
      .select("order_no, customer, product, status")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("consultations")
      .select("name, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const stats = [
    { label: "전체 회원", value: `${memberCount ?? 0}명`, icon: Users },
    { label: "전체 주문", value: `${orderCount ?? 0}건`, icon: ShoppingCart },
    { label: "미답변 상담", value: `${consultationCount ?? 0}건`, icon: MessageSquare },
    { label: "등록 상품", value: `${productCount ?? 0}개`, icon: Package },
  ];

  return (
    <div className="max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent members */}
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">최근 가입 회원</h3>
            <Link href="/admin/members" className="text-xs text-primary hover:underline">
              전체보기
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>이메일</TableHead>
                <TableHead>가입일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recentMembers ?? []).map((m) => (
                <TableRow key={m.email}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(m.status)}>{m.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentMembers && recentMembers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Recent orders */}
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">최근 주문</h3>
            <Link href="/admin/orders" className="text-xs text-primary hover:underline">
              전체보기
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>주문번호</TableHead>
                <TableHead>고객</TableHead>
                <TableHead>상품</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recentOrders ?? []).map((o) => (
                <TableRow key={o.order_no}>
                  <TableCell className="font-medium">{o.order_no}</TableCell>
                  <TableCell className="text-muted-foreground">{o.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{o.product}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentOrders && recentOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Recent consultations */}
        <div className="rounded-xl border border-border bg-white p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">최근 상담 문의</h3>
            <Link href="/admin/consulting" className="text-xs text-primary hover:underline">
              전체보기
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>이름</TableHead>
                <TableHead>제목</TableHead>
                <TableHead>등록일</TableHead>
                <TableHead>상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recentConsultations ?? []).map((q) => (
                <TableRow key={q.subject + q.created_at}>
                  <TableCell className="font-medium">{q.name}</TableCell>
                  <TableCell className="text-muted-foreground">{q.subject}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(q.created_at).toLocaleDateString("ko-KR")}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(q.status)}>{q.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {recentConsultations && recentConsultations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
