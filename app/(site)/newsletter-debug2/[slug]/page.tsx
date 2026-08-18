import { notFound } from "next/navigation";
import { headers } from "next/headers";
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

export default async function NewsletterDebug2Page({ params, searchParams }: Props) {
  const { slug } = await params;
  const { feedback } = await searchParams;
  const newsletter = await getPublishedNewsletterBySlug(slug);
  if (!newsletter) notFound();

  const headerList = await headers();
  await recordNewsletterView(newsletter.id, null, headerList.get("referer"));

  const banners = await getAdBannersByIds(getAdBannerIds(newsletter.blocks));

  return (
    <article className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">{newsletter.title}</h1>
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
