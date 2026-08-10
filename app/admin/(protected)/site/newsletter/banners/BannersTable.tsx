"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BANNER_POSITION_LABEL } from "../labels";
import type { BannerRow } from "../types";

type Props = {
  banners: BannerRow[];
  deleteBannerAction: (formData: FormData) => Promise<void>;
  deleteBannersAction: (formData: FormData) => Promise<void>;
};

export default function BannersTable({ banners, deleteBannerAction, deleteBannersAction }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const allSelected = banners.length > 0 && banners.every((b) => selected.has(b.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(banners.map((b) => b.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selected.size === 0) {
      window.alert("삭제할 배너를 선택해 주세요.");
      return;
    }
    if (!window.confirm("정말로 삭제하겠습니까?")) return;

    const formData = new FormData();
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deleteBannersAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size}건 선택됨` : "배너를 선택하세요"}
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
              <TableHead>미리보기</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>위치</TableHead>
              <TableHead>노출기간</TableHead>
              <TableHead>노출수 / 클릭수</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(b.id)}
                    onCheckedChange={() => toggleOne(b.id)}
                    aria-label="선택"
                  />
                </TableCell>
                <TableCell>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.imageUrl} alt={b.name} className="w-16 h-10 object-cover rounded border border-border" />
                </TableCell>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {BANNER_POSITION_LABEL[b.position] ?? b.position}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {b.startDate} ~ {b.endDate}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {b.impressions.toLocaleString()} / {b.clicks.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={b.isActive ? "default" : "secondary"}>
                    {b.isActive ? "활성" : "비활성"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/site/newsletter/banners/${b.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteBannerAction}>
                      <input type="hidden" name="id" value={b.id} />
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

            {banners.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  등록된 배너가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
