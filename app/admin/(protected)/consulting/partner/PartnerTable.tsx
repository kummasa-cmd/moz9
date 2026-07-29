"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAGE_SIZE_OPTIONS, type AdminPartnerPostRow } from "./types";

function statusVariant(status: string) {
  return status === "답변완료" ? ("default" as const) : ("destructive" as const);
}

type Props = {
  posts: AdminPartnerPostRow[];
  selectedId?: string;
  page: number;
  limit: number;
  totalPages: number;
};

export default function PartnerTable({ posts, selectedId, page, limit, totalPages }: Props) {
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
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">번호</TableHead>
              <TableHead>거래처명</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>처리일</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((p) => (
              <TableRow key={p.id} className={selectedId === p.id ? "bg-primary/5" : ""}>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {p.number}
                </TableCell>
                <TableCell className="font-medium p-0">
                  <Link
                    href={`/admin/consulting/partner?id=${p.id}&page=${page}&limit=${limit}`}
                    className="block px-2 py-2"
                  >
                    {p.partnerName}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground p-0">
                  <Link
                    href={`/admin/consulting/partner?id=${p.id}&page=${page}&limit=${limit}`}
                    className="block px-2 py-2 truncate max-w-xs"
                  >
                    {p.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {p.processedAt ? new Date(p.processedAt).toLocaleDateString("ko-KR") : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}

            {posts.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  등록된 거래처 문의가 없습니다.
                </TableCell>
              </TableRow>
            )}
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
