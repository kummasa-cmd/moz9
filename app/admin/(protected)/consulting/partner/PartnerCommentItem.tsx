"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { updatePartnerComment, deletePartnerComment } from "./actions";
import type { AdminPartnerComment } from "./types";

type Props = {
  comment: AdminPartnerComment;
  page: number;
  limit: number;
};

export default function PartnerCommentItem({ comment, page, limit }: Props) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <form action={updatePartnerComment.bind(null, comment.id)} className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
        <input type="hidden" name="page" value={page} />
        <input type="hidden" name="limit" value={limit} />
        <textarea
          name="content"
          defaultValue={comment.content}
          rows={3}
          required
          className="w-full rounded-md border border-input bg-white px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            취소
          </button>
          <button type="submit" className="text-xs font-medium text-primary hover:underline">
            저장
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className={`rounded-lg border p-3 ${comment.isAdmin ? "border-primary/30 bg-primary/5" : "border-border bg-muted/20"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{comment.authorName}</span>
          <span className="text-[11px] text-muted-foreground">
            {new Date(comment.createdAt).toLocaleDateString("ko-KR")}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {comment.isAdmin && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-muted-foreground hover:text-primary transition-colors"
              aria-label="수정"
            >
              <Pencil size={12} />
            </button>
          )}
          <form
            action={deletePartnerComment}
            onSubmit={(e) => {
              if (!window.confirm("정말로 삭제하시겠습니까?")) e.preventDefault();
            }}
          >
            <input type="hidden" name="comment_id" value={comment.id} />
            <input type="hidden" name="page" value={page} />
            <input type="hidden" name="limit" value={limit} />
            <button type="submit" className="text-muted-foreground hover:text-destructive transition-colors" aria-label="삭제">
              <Trash2 size={12} />
            </button>
          </form>
        </div>
      </div>
      <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
}
