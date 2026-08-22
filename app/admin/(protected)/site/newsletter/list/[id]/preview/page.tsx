import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import { PreviewToggle } from "@/components/admin/newsletter/PreviewToggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdBannersByIds } from "@/lib/newsletter/queries";
import { newsletterConfig } from "@/lib/newsletter/config";
import { NewsletterBlocks } from "@/lib/newsletter/blocks/web-renderer";
import { renderBlocksToHtml } from "@/lib/newsletter/blocks/email-renderer";
import { buildPreviewEmailHtml } from "@/lib/newsletter/email";
import { getAdBannerIds, type ContentBlock } from "@/lib/newsletter/blocks/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminNewsletterPreviewPage({ params }: Props) {
  const { id } = await params;

  const supabase = createAdminClient();
  const { data: newsletter } = await supabase
    .from("newsletters")
    .select("id, title, slug, subject, blocks, published_at, issue_number")
    .eq("id", id)
    .maybeSingle();

  if (!newsletter) notFound();

  const blocks = (newsletter.blocks as ContentBlock[] | null) ?? [];
  const banners = await getAdBannersByIds(getAdBannerIds(blocks));

  const emailBody = renderBlocksToHtml(blocks, {
    brandColor: newsletterConfig.brandColor,
    banners,
    newsletterId: newsletter.id,
    slug: newsletter.slug,
  });
  const emailHtml = buildPreviewEmailHtml(emailBody, {
    newsletterId: newsletter.id,
    slug: newsletter.slug,
    publishedAt: newsletter.published_at,
    issueNumber: newsletter.issue_number,
  });

  return (
    <div>
      <PageHeader
        title="미리보기"
        description={`"${newsletter.title}" · 이메일 제목: ${newsletter.subject}`}
      />
      <PreviewToggle
        web={
          <NewsletterBlocks
            blocks={blocks}
            banners={banners}
            newsletterId={newsletter.id}
            slug={newsletter.slug}
          />
        }
        emailHtml={emailHtml}
      />
    </div>
  );
}
