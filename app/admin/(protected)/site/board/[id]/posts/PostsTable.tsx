"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
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
import { PAGE_SIZE_OPTIONS, type AdminPostRow } from "./types";

type Props = {
  boardId: string;
  posts: AdminPostRow[];
  useCategory: boolean;
  showNewsletterUsage?: boolean;
  page: number;
  limit: number;
  totalPages: number;
  deletePostAction: (formData: FormData) => Promise<void>;
  deletePostsAction: (formData: FormData) => Promise<void>;
};

export default function PostsTable({
  boardId,
  posts,
  useCategory,
  showNewsletterUsage = false,
  page,
  limit,
  totalPages,
  deletePostAction,
  deletePostsAction,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const colCount = (useCategory ? 8 : 7) + 1 + (showNewsletterUsage ? 2 : 0);
  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.id)));
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
      window.alert("삭제할 게시물을 선택해 주세요.");
      return;
    }
    if (!window.confirm("정말로 삭제하겠습니까?")) return;

    const formData = new FormData();
    formData.append("board_id", boardId);
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deletePostsAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-muted-foreground">
          {selected.size > 0 ? `${selected.size}개 선택됨` : "게시물을 선택하세요"}
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
              <TableHead className="w-12 text-center">번호</TableHead>
              {useCategory && <TableHead className="w-28">카테고리</TableHead>}
              <TableHead>제목</TableHead>
              <TableHead className="w-24">작성자</TableHead>
              <TableHead className="w-28">등록일</TableHead>
              <TableHead className="w-20 text-center">조회수</TableHead>
              {showNewsletterUsage && (
                <>
                  <TableHead className="w-24 text-center">뉴스레터 사용횟수</TableHead>
                  <TableHead className="w-28 text-center">최종 사용일</TableHead>
                </>
              )}
              <TableHead className="w-20">상태</TableHead>
              <TableHead className="text-right w-20">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((p) => (
              <TableRow key={p.id} className={p.isNotice ? "bg-primary/5" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(p.id)}
                    onCheckedChange={() => toggleOne(p.id)}
                    aria-label="선택"
                  />
                </TableCell>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {p.number}
                </TableCell>
                {useCategory && (
                  <TableCell className="text-muted-foreground text-sm">
                    {p.categoryName ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {p.isNotice && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary text-white flex-shrink-0">
                        공지
                      </span>
                    )}
                    <Link
                      href={`/admin/site/board/${boardId}/posts/${p.id}`}
                      className="hover:text-primary hover:underline transition-colors"
                    >
                      {p.title}
                    </Link>
                    {p.commentCount > 0 && (
                      <span className="text-xs text-primary font-medium flex-shrink-0">
                        [{p.commentCount}]
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {p.author ?? <span className="text-muted-foreground/40">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(p.createdAt).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {p.viewCount.toLocaleString()}
                </TableCell>
                {showNewsletterUsage && (
                  <>
                    <TableCell className="text-center text-muted-foreground tabular-nums">
                      {p.newsletterUseCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center text-muted-foreground text-sm">
                      {p.newsletterLastUsedAt ? (
                        new Date(p.newsletterLastUsedAt).toLocaleDateString("ko-KR")
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </TableCell>
                  </>
                )}
                <TableCell>
                  <Badge variant={p.status === "게시중" ? "default" : "secondary"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/site/board/${boardId}/posts/${p.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deletePostAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="board_id" value={boardId} />
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

            {posts.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-10">
                  등록된 게시물이 없습니다.
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
