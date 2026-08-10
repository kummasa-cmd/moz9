"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Trash2, RotateCcw, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { SUBSCRIBER_SOURCE_LABEL, SUBSCRIBER_STATUS_LABEL } from "../labels";
import { PAGE_SIZE_OPTIONS, type SubscriberRow } from "../types";

function statusVariant(status: string) {
  if (status === "SUBSCRIBED") return "default" as const;
  if (status === "BOUNCED") return "destructive" as const;
  return "secondary" as const;
}

type Props = {
  subscribers: SubscriberRow[];
  page: number;
  limit: number;
  totalPages: number;
  setStatusAction: (formData: FormData) => Promise<void>;
  deleteSubscriberAction: (formData: FormData) => Promise<void>;
  deleteSubscribersAction: (formData: FormData) => Promise<void>;
};

export default function SubscribersTable({
  subscribers,
  page,
  limit,
  totalPages,
  setStatusAction,
  deleteSubscriberAction,
  deleteSubscribersAction,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = subscribers.length > 0 && subscribers.every((s) => selected.has(s.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(subscribers.map((s) => s.id)));
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
      window.alert("삭제할 구독자를 선택해 주세요.");
      return;
    }
    if (!window.confirm("정말로 삭제하겠습니까?")) return;

    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deleteSubscribersAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size}명 선택됨` : "구독자를 선택하세요"}
        </span>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 bg-white px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        >
          <Trash2 size={14} />
          전체삭제
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
              <TableHead>이름</TableHead>
              <TableHead>등록경로</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subscribers.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggleOne(s.id)}
                    aria-label="선택"
                  />
                </TableCell>
                <TableCell className="font-medium">{s.email}</TableCell>
                <TableCell className="text-muted-foreground">{s.name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {SUBSCRIBER_SOURCE_LABEL[s.source] ?? s.source}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(s.subscribedAt).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(s.status)}>
                    {SUBSCRIBER_STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    {s.status !== "BOUNCED" && (
                      <form action={setStatusAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input
                          type="hidden"
                          name="status"
                          value={s.status === "SUBSCRIBED" ? "UNSUBSCRIBED" : "SUBSCRIBED"}
                        />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-primary transition-colors"
                          aria-label={s.status === "SUBSCRIBED" ? "수신거부 처리" : "재구독 처리"}
                          title={s.status === "SUBSCRIBED" ? "수신거부 처리" : "재구독 처리"}
                        >
                          {s.status === "SUBSCRIBED" ? <UserX size={15} /> : <RotateCcw size={15} />}
                        </button>
                      </form>
                    )}
                    <form action={deleteSubscriberAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {subscribers.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                  등록된 구독자가 없습니다.
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
