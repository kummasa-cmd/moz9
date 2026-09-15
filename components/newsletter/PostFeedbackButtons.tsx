"use client";

import type { MouseEvent } from "react";
import Link from "next/link";
import { ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

type VoteType = "like" | "dislike";

const VOTE_LABEL: Record<VoteType, string> = { like: "좋았어요", dislike: "아쉬워요" };

type Props = {
  likeUrl: string;
  likeCount: number;
  votedType: VoteType | null;
  justVoted: VoteType | null;
};

export function PostFeedbackButtons({ likeUrl, likeCount, votedType, justVoted }: Props) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (!votedType) return;
    e.preventDefault();
    window.alert(`이미 "${VOTE_LABEL[votedType]}"를 선택하셨습니다.`);
  }

  return (
    <>
      <Link
        href={likeUrl}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
          votedType === "like"
            ? "border-primary text-primary bg-primary/10"
            : "border-border text-muted-foreground hover:border-primary hover:text-primary",
        )}
      >
        <ThumbsUp size={11} />
        좋았어요{likeCount > 0 ? ` ${likeCount}` : ""}
      </Link>
      {justVoted && <span className="text-xs text-primary">감사합니다!</span>}
    </>
  );
}
