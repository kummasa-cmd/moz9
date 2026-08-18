"use client";

import { useMemo, useState } from "react";
import { X, Import, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { FormSelect } from "@/components/admin/FormSelect";
import type { BoardPostOption } from "@/lib/newsletter/queries";

type Props = {
  posts: BoardPostOption[];
  importedPostIds?: Set<string>;
  onImport: (posts: BoardPostOption[]) => void;
  onClose: () => void;
};

export function BoardPostPicker({ posts, importedPostIds, onImport, onClose }: Props) {
  const [boardFilter, setBoardFilter] = useState("전체");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const boardNames = useMemo(
    () => ["전체", ...Array.from(new Set(posts.map((p) => p.boardName)))],
    [posts],
  );

  const filtered = useMemo(
    () => (boardFilter === "전체" ? posts : posts.filter((p) => p.boardName === boardFilter)),
    [posts, boardFilter],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleImport() {
    const chosen = posts.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    onImport(chosen);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-foreground">게시판에서 가져오기</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              여러 개를 선택할 수 있습니다. 선택한 글마다 하나의 섹션(작성자+제목+본문)이 만들어집니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-border">
          <FormSelect value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)} className="w-40">
            {boardNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </FormSelect>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">게시물이 없습니다.</p>
          )}
          {filtered.map((post) => {
            const alreadyImported = importedPostIds?.has(post.id) ?? false;
            return (
              <label
                key={post.id}
                className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Checkbox checked={selected.has(post.id)} onCheckedChange={() => toggle(post.id)} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary flex-shrink-0">
                        {post.boardName}
                      </span>
                      <span className="text-sm font-medium text-foreground truncate">{post.title}</span>
                      {alreadyImported && (
                        <span className="inline-flex items-center gap-0.5 text-xs text-primary flex-shrink-0">
                          <Check size={12} />
                          추가됨
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      뉴스레터 사용 {post.newsletterUseCount}회
                      {" · "}
                      최종 사용일{" "}
                      {post.newsletterLastUsedAt
                        ? new Date(post.newsletterLastUsedAt).toLocaleDateString("ko-KR")
                        : "미사용"}
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-sm text-muted-foreground">
            {selected.size > 0 ? `${selected.size}개 선택됨` : "가져올 글을 선택하세요"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Import size={14} />
              선택한 글 가져오기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
