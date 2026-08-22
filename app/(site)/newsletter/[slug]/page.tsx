import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import {
  getPublishedNewsletterBySlug,
  getAdBannersByIds,
  recordNewsletterView,
} from "@/lib/newsletter/queries";
import { getAdBannerIds } from "@/lib/newsletter/blocks/types";
import { NewsletterBlocks } from "@/lib/newsletter/blocks/web-renderer";
import { NewsletterFooterActions } from "@/components/newsletter/NewsletterFooterActions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ feedback?: string }>;
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
  const { feedback } = await searchParams;
  const newsletter = await getPublishedNewsletterBySlug(slug);
  if (!newsletter) notFound();

  const headerList = await headers();
  await recordNewsletterView(newsletter.id, null, headerList.get("referer"));

  const banners = await getAdBannersByIds(getAdBannerIds(newsletter.blocks));

  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
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

      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{newsletter.title}</h1>
      <p className="text-sm text-muted-foreground mb-10">조회 {newsletter.viewCount.toLocaleString()}</p>

      <NewsletterBlocks blocks={newsletter.blocks} banners={banners} />

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
