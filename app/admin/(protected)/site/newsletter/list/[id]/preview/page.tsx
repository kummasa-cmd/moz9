import { notFound } from "next/navigation";
import PageHeader from "@/components/admin/PageHeader";
import { PreviewToggle } from "@/components/admin/newsletter/PreviewToggle";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdBannersByIds } from "@/lib/newsletter/queries";
import { newsletterConfig } from "@/lib/newsletter/config";
import { NewsletterBlocks } from "@/lib/newsletter/blocks/web-renderer";
import { renderBlocksToHtml } from "@/lib/newsletter/blocks/email-renderer";
import { getAdBannerIds, type ContentBlock } from "@/lib/newsletter/blocks/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminNewsletterPreviewPage({ params }: Props) {
  const { id } = await params;

  const supabase = createAdminClient();
  const { data: newsletter } = await supabase
    .from("newsletters")
    .select("id, title, subject, blocks")
    .eq("id", id)
    .maybeSingle();

  if (!newsletter) notFound();

  const blocks = (newsletter.blocks as ContentBlock[] | null) ?? [];
  const banners = await getAdBannersByIds(getAdBannerIds(blocks));

  const emailBody = renderBlocksToHtml(blocks, { brandColor: newsletterConfig.brandColor, banners });
  const emailHtml = `<!doctype html><html><head><meta charset="utf-8" /></head><body style="margin:0;padding:24px;background:#f4f4f5;"><div style="max-width:600px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px;">${emailBody}</div></body></html>`;

  return (
    <div>
      <PageHeader
        title="미리보기"
        description={`"${newsletter.title}" · 이메일 제목: ${newsletter.subject}`}
      />
      <PreviewToggle web={<NewsletterBlocks blocks={blocks} banners={banners} />} emailHtml={emailHtml} />
    </div>
  );
}
