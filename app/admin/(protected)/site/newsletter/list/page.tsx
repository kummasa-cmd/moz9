import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteNewsletter, deleteNewsletters, cancelCampaign, sendCampaignNow } from "../actions";
import NewsletterSendTable from "./NewsletterSendTable";
import { PAGE_SIZE_OPTIONS, type NewsletterSendRow, type CampaignSummary } from "../types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminNewsletterListPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();
  const {
    data: newsletters,
    error,
    count,
  } = await supabase
    .from("newsletters")
    .select("id, title, slug, status, view_count, like_count, dislike_count, published_at, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const newsletterIds = (newsletters ?? []).map((n) => n.id);
  const { data: campaigns } = newsletterIds.length
    ? await supabase
        .from("newsletter_campaigns")
        .select(
          "id, newsletter_id, name, send_type, status, scheduled_at, recurring_time, range_start, range_end, target_all, target_tags, total_recipients, total_sent, created_at",
        )
        .in("newsletter_id", newsletterIds)
        .order("created_at", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const campaignByNewsletterId = new Map<string, CampaignSummary>();
  for (const c of campaigns ?? []) {
    const newsletterId = c.newsletter_id as string;
    if (campaignByNewsletterId.has(newsletterId)) continue;
    campaignByNewsletterId.set(newsletterId, {
      id: c.id as string,
      name: c.name as string,
      sendType: c.send_type as string,
      status: c.status as string,
      scheduledAt: c.scheduled_at as string | null,
      recurringTime: c.recurring_time as string | null,
      rangeStart: c.range_start as string | null,
      rangeEnd: c.range_end as string | null,
      targetAll: c.target_all as boolean,
      targetTags: (c.target_tags as string[] | null) ?? [],
      totalRecipients: (c.total_recipients as number | null) ?? 0,
      totalSent: (c.total_sent as number | null) ?? 0,
    });
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: NewsletterSendRow[] = (newsletters ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    slug: n.slug,
    status: n.status,
    viewCount: n.view_count ?? 0,
    likeCount: n.like_count ?? 0,
    dislikeCount: n.dislike_count ?? 0,
    publishedAt: n.published_at,
    createdAt: n.created_at,
    campaign: campaignByNewsletterId.get(n.id) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="뉴스레터 발송 목록"
        description={`전체 ${totalCount}건 · 콘텐츠 상태와 발송 예약 현황을 함께 확인합니다.`}
        actionHref="/admin/site/newsletter/manage"
        actionLabel="새 뉴스레터"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <NewsletterSendTable
        newsletters={rows}
        page={page}
        limit={limit}
        totalPages={totalPages}
        deleteNewsletterAction={deleteNewsletter}
        deleteNewslettersAction={deleteNewsletters}
        cancelCampaignAction={cancelCampaign}
        sendCampaignNowAction={sendCampaignNow}
      />
    </div>
  );
}
