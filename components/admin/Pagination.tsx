"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS } from "./pagination-constants";

type Props = {
  page: number;
  limit: number;
  totalPages: number;
};

export default function Pagination({ page, limit, totalPages }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
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
  );
}
