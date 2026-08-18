import Link from "next/link";
import { ThumbsUp, ThumbsDown, Handshake, Archive, Mail } from "lucide-react";
import { getNewsletterFeedbackUrl } from "@/lib/newsletter/config";

type Props = {
  newsletterId: string;
  slug: string;
  likeCount: number;
  dislikeCount: number;
};

export function NewsletterFooterActions({ newsletterId, slug, likeCount, dislikeCount }: Props) {
  return (
    <div className="mt-12 pt-8 border-t border-border flex flex-col items-center gap-8">
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-3">이번 뉴스레터 어떠셨나요?</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href={getNewsletterFeedbackUrl(newsletterId, slug, "like")}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <ThumbsUp size={14} />
            좋았어요 {likeCount > 0 && likeCount}
          </Link>
          <Link
            href={getNewsletterFeedbackUrl(newsletterId, slug, "dislike")}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            <ThumbsDown size={14} />
            아쉬워요 {dislikeCount > 0 && dislikeCount}
          </Link>
        </div>
      </div>

      <Link
        href="/contact"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Handshake size={14} />
        제휴·협업 문의
      </Link>

      <div className="flex items-center gap-6">
        <Link
          href="/newsletter"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Archive size={14} />
          이전뉴스 보기
        </Link>
        <Link
          href="/newsletter/subscribe"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <Mail size={14} />
          구독하기
        </Link>
      </div>
    </div>
  );
}
