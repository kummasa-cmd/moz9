"use client";

import { useState } from "react";
import Link from "next/link";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichEditor from "@/components/RichEditor";

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type BoardOption = { slug: string; name: string };
type CategoryOption = { id: string; name: string };

type Props = {
  boards: BoardOption[];
  categoriesByBoard: Record<string, CategoryOption[]>;
  action: (formData: FormData) => void;
  error?: string;
};

export default function NewColumnPostForm({ boards, categoriesByBoard, action, error }: Props) {
  const [slug, setSlug] = useState(boards[0]?.slug ?? "");
  const categories = categoriesByBoard[slug] ?? [];

  return (
    <form action={action} className="rounded-xl border border-border bg-white p-6 space-y-5">
      <div className="space-y-2">
        <Label htmlFor="slug">
          게시판 종류 <span className="text-destructive">*</span>
        </Label>
        <select
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={SELECT_CLASS}
        >
          {boards.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {categories.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="category_id">
            카테고리 <span className="text-destructive">*</span>
          </Label>
          <select id="category_id" name="category_id" required key={slug} className={SELECT_CLASS}>
            <option value="">카테고리를 선택하세요</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="title">
          제목 <span className="text-destructive">*</span>
        </Label>
        <Input id="title" name="title" required placeholder="제목을 입력하세요" />
      </div>

      <div className="space-y-2">
        <Label>
          내용 <span className="text-destructive">*</span>
          <span className="ml-2 text-xs text-muted-foreground font-normal">
            이미지는 붙여넣기 또는 툴바 아이콘으로 삽입 (최대 5MB)
          </span>
        </Label>
        <RichEditor name="content" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Send size={14} />
          등록하기
        </button>
        <Link
          href="/mypage/column"
          className="inline-flex items-center justify-center rounded-md border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          취소
        </Link>
      </div>
    </form>
  );
}
