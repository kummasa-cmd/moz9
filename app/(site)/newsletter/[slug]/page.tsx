import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import {
  getPublishedNewsletterBySlug,
  getAdBannersByIds,
  getNewsletterPostFeedbackCounts,
  recordNewsletterView,
} from "@/lib/newsletter/queries";
import { getAdBannerIds, getSourcePostIds } from "@/lib/newsletter/blocks/types";
import { NewsletterBlocks } from "@/lib/newsletter/blocks/web-renderer";
import { NewsletterFooterActions } from "@/components/newsletter/NewsletterFooterActions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ feedback?: string; postFeedback?: string; postFeedbackId?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const newsletter = await getPublishedNewsletterBySlug(slug);
  if (!newsletter) return { title: "뉴스레터 | 모즈나인" };

  return {
    title: `${newsletter.title} | 모즈나인 뉴스레터`,
    description: newsletter.preheader ?? undefined,
  };
}

export default async function NewsletterDetailPage({ params, searchParams }: Props) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const { feedback, postFeedback, postFeedbackId } = await searchParams;
  const newsletter = await getPublishedNewsletterBySlug(slug);
  if (!newsletter) notFound();

  const headerList = await headers();
  await recordNewsletterView(newsletter.id, null, headerList.get("referer"));

  const banners = await getAdBannersByIds(getAdBannerIds(newsletter.blocks));
  const postFeedbackCounts = await getNewsletterPostFeedbackCounts(newsletter.id);
  const justVotedType = postFeedback === "like" || postFeedback === "dislike" ? postFeedback : null;

  const cookieStore = await cookies();
  const postVotes: Record<string, "like" | "dislike"> = {};
  for (const sourcePostId of getSourcePostIds(newsletter.blocks)) {
    const vote = cookieStore.get(`nl_voted_post_${newsletter.id}_${sourcePostId}`)?.value;
    if (vote === "like" || vote === "dislike") postVotes[sourcePostId] = vote;
  }

  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <Link href="/newsletter" className="block mb-8">
        <Image
          src="/images/letter_title.png"
          alt="뉴스레터"
          width={1600}
          height={500}
          className="w-full h-auto rounded-xl"
          priority
        />
      </Link>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground mb-8 pb-4 border-b border-border">
        {newsletter.publishedAt && (
          <span>{new Date(newsletter.publishedAt).toLocaleDateString("ko-KR")}</span>
        )}
        {newsletter.issueNumber !== null && (
          <>
            <span aria-hidden className="text-border">
              |
            </span>
            <span>제{newsletter.issueNumber}호</span>
          </>
        )}
        <span aria-hidden className="text-border">
          |
        </span>
        <Link href="/newsletter/subscribe" className="hover:text-primary transition-colors">
          구독하기
        </Link>
        <span aria-hidden className="text-border">
          |
        </span>
        <Link href="/newsletter" className="hover:text-primary transition-colors">
          지난호
        </Link>
      </div>

      <p className="text-sm text-muted-foreground mb-10">조회 {newsletter.viewCount.toLocaleString()}</p>

      {newsletter.newsletterType === "PROMOTIONAL" && (
        <div className="mb-10 rounded-xl bg-primary/5 p-6 text-center">
          <p className="text-sm text-foreground mb-3">
            이 뉴스레터가 마음에 드셨다면, 새 소식을 이메일로 계속 받아보세요.
          </p>
          <Link
            href="/newsletter/subscribe"
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            지금 구독하기
          </Link>
        </div>
      )}

      <NewsletterBlocks
        blocks={newsletter.blocks}
        banners={banners}
        newsletterId={newsletter.id}
        slug={newsletter.slug}
        postFeedbackCounts={postFeedbackCounts}
        postVotes={postVotes}
        justVotedPostId={postFeedbackId}
        justVotedType={justVotedType}
      />

      {(feedback === "like" || feedback === "dislike") && (
        <p className="mt-8 text-center text-sm text-primary">소중한 의견 감사합니다.</p>
      )}

      <NewsletterFooterActions
        newsletterId={newsletter.id}
        slug={newsletter.slug}
        likeCount={newsletter.likeCount}
        dislikeCount={newsletter.dislikeCount}
      />
    </article>
  );
}
