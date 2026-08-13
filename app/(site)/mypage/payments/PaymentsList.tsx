"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type MyPaymentRow } from "./types";

function statusVariant(status: string) {
  if (status === "입금완료") return "default" as const;
  if (status === "환불") return "destructive" as const;
  return "secondary" as const;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ko-KR") : "-";
}

function formatAmount(value: number) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

type Props = {
  payments: MyPaymentRow[];
  page: number;
  limit: number;
  totalPages: number;
};

export default function PaymentsList({ payments, page, limit, totalPages }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div>
      <div className="rounded-xl border border-border bg-white overflow-hidden overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">번호</TableHead>
              <TableHead>결제코드</TableHead>
              <TableHead>회사명</TableHead>
              <TableHead>관리자명</TableHead>
              <TableHead>구분</TableHead>
              <TableHead>상품명</TableHead>
              <TableHead className="w-28">계약시작일</TableHead>
              <TableHead className="w-28">계약종료일</TableHead>
              <TableHead>입금액</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="w-20 text-right">상세보기</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{p.number}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{p.orderCode}</TableCell>
                <TableCell className="font-medium">{p.companyName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{p.managerName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{p.category}</TableCell>
                <TableCell className="text-muted-foreground">{p.productName ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(p.contractStart)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(p.contractEnd)}</TableCell>
                <TableCell className="text-muted-foreground">{formatAmount(p.paidAmount)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/mypage/payments/${p.id}`}
                    className="inline-flex items-center gap-0.5 text-xs text-primary font-medium hover:underline"
                  >
                    상세보기
                    <ChevronRight size={12} />
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>페이지당</span>
          <Select
            value={String(limit)}
            onValueChange={(value) => {
              if (value) updateQuery({ limit: value, page: "1" });
            }}
          >
            <SelectTrigger size="sm" className="w-20">
              <SelectValue>{(value: string) => `${value}개`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}개
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => updateQuery({ page: String(page - 1) })}
              disabled={page <= 1}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
            >
              이전
            </button>
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => updateQuery({ page: String(page + 1) })}
              disabled={page >= totalPages}
              className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-muted transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
