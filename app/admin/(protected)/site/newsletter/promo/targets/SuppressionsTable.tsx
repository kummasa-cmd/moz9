"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
import { PAGE_SIZE_OPTIONS, type SuppressionRow } from "../../types";

type Props = {
  suppressions: SuppressionRow[];
  page: number;
  limit: number;
  totalPages: number;
  deleteSuppressionAction: (formData: FormData) => Promise<void>;
  deleteSuppressionsAction: (formData: FormData) => Promise<void>;
};

export default function SuppressionsTable({
  suppressions,
  page,
  limit,
  totalPages,
  deleteSuppressionAction,
  deleteSuppressionsAction,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = suppressions.length > 0 && suppressions.every((s) => selected.has(s.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(suppressions.map((s) => s.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateQuery(next: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function handleBulkDelete() {
    if (selected.size === 0) {
      window.alert("삭제할 항목을 선택해 주세요.");
      return;
    }
    if (!window.confirm("수신거부를 해제하면 해당 이메일로 뉴스레터가 다시 발송될 수 있습니다. 계속할까요?")) {
      return;
    }

    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deleteSuppressionsAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size}건 선택됨` : "항목을 선택하세요"}
        </span>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-white px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} />
          선택 해제(삭제)
        </button>
      </div>

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
              </TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>수신거부일</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppressions.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggleOne(s.id)}
                    aria-label="선택"
                  />
                </TableCell>
                <TableCell className="font-medium">{s.email}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(s.unsubscribedAt).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-right">
                  <form
                    action={deleteSuppressionAction}
                    onSubmit={(e) => {
                      if (
                        !window.confirm(
                          "수신거부를 해제하면 해당 이메일로 뉴스레터가 다시 발송될 수 있습니다. 계속할까요?",
                        )
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <button
                      type="submit"
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="수신거부 해제"
                      title="수신거부 해제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                </TableCell>
              </TableRow>
            ))}

            {suppressions.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  수신거부한 이메일이 없습니다.
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
              if (value) updateQuery({ suppressedLimit: value, suppressedPage: "1" });
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
              onClick={() => updateQuery({ suppressedPage: String(page - 1) })}
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
              onClick={() => updateQuery({ suppressedPage: String(page + 1) })}
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
