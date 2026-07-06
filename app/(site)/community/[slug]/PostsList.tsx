"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type CommunityPostRow } from "./types";

type Props = {
  slug: string;
  posts: CommunityPostRow[];
  canBulkDelete: boolean;
  page: number;
  limit: number;
  totalPages: number;
  deletePostAction: (formData: FormData) => Promise<void>;
  deletePostsAction: (formData: FormData) => Promise<void>;
};

export default function PostsList({
  slug,
  posts,
  canBulkDelete,
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

  const selectableIds = posts.filter((p) => p.editable).map((p) => p.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
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
    formData.append("slug", slug);
    selected.forEach((id) => formData.append("ids", id));

    startTransition(async () => {
      await deletePostsAction(formData);
      setSelected(new Set());
    });
  }

  return (
    <div>
      {canBulkDelete && (
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
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {posts.length > 0 ? (
          <ul className="divide-y divide-border">
            {canBulkDelete && selectableIds.length > 0 && (
              <li className="flex items-center gap-2 px-5 py-2 bg-muted/30">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="전체 선택" />
                <span className="text-xs text-muted-foreground">전체 선택</span>
              </li>
            )}
            {posts.map((post) => (
              <li
                key={post.id}
                className={`flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors ${post.isNotice ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {post.editable && (
                    <Checkbox
                      checked={selected.has(post.id)}
                      onCheckedChange={() => toggleOne(post.id)}
                      aria-label="선택"
                    />
                  )}
                  {post.isNotice && (
                    <span className="flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary text-white">
                      공지
                    </span>
                  )}
                  <Link
                    href={`/community/${slug}/${post.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary hover:underline truncate transition-colors"
                  >
                    {post.title}
                  </Link>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground hidden sm:block">{post.author ?? "—"}</span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    {new Date(post.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    조회 {post.viewCount.toLocaleString()}
                  </span>
                  {post.editable && (
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/community/${slug}/${post.id}/edit`}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label="수정"
                      >
                        <Pencil size={14} />
                      </Link>
                      <form action={deletePostAction}>
                        <input type="hidden" name="post_id" value={post.id} />
                        <input type="hidden" name="slug" value={slug} />
                        <button
                          type="submit"
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="삭제"
                        >
                          <Trash2 size={14} />
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-16 text-muted-foreground text-sm">
            등록된 게시물이 없습니다.
          </div>
        )}
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
