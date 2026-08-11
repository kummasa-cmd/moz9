"use client";

import { Trash2 } from "lucide-react";
import { deletePartnerPost } from "./actions";

type Props = {
  postId: string;
};

export default function PartnerDeleteButton({ postId }: Props) {
  return (
    <form
      action={deletePartnerPost}
      onSubmit={(e) => {
        if (!window.confirm("정말로 삭제하시겠습니까? 삭제된 내용은 복구할 수 없습니다.")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={postId} />
      <button
        type="submit"
        className="text-muted-foreground hover:text-destructive transition-colors"
        aria-label="삭제"
      >
        <Trash2 size={15} />
      </button>
    </form>
  );
}
