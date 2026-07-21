"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type MyConsultationRow } from "./types";

const statusVariant = (s: string) => (s === "답변완료" ? ("default" as const) : ("destructive" as const));

type Props = {
  consultations: MyConsultationRow[];
  page: number;
  limit: number;
  totalPages: number;
};

export default function ConsultationsList({ consultations, page, limit, totalPages }: Props) {
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
        {consultations.length > 0 ? (
          <ul className="divide-y divide-border">
            {consultations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/mypage/consultations/${c.id}`}
                  className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="min-w-0 flex items-start gap-3">
                    <span className="text-xs text-muted-foreground/70 tabular-nums pt-0.5 flex-shrink-0">
                      {c.number}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                  </div>
                  <Badge variant={statusVariant(c.status)} className="flex-shrink-0 text-xs">
                    {c.status}
                  </Badge>
                </Link>
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

      {consultations.length > 0 && (
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
      )}
    </div>
  );
}
