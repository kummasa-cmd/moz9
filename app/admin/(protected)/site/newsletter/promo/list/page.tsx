import Link from "next/link";
import { Users, BarChart3 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteNewsletter, deleteNewsletters, cancelCampaign, sendCampaignNow } from "../../actions";
import NewsletterSendTable from "../../list/NewsletterSendTable";
import { PAGE_SIZE_OPTIONS, type NewsletterSendRow, type CampaignSummary } from "../../types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminNewsletterPromoListPage({ searchParams }: Props) {
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
    .eq("newsletter_type", "PROMOTIONAL")
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
        title="홍보 뉴스레터"
        description={`전체 ${totalCount}건 · 구독자를 모으기 위한 홍보용 뉴스레터입니다.`}
        actionHref="/admin/site/newsletter/promo"
        actionLabel="새 홍보 뉴스레터"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/site/newsletter/promo/targets"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <Users size={14} />
              대상자관리
            </Link>
            <Link
              href="/admin/site/newsletter/promo/analytics"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 size={14} />
              통계
            </Link>
          </div>
        }
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
        editHref={(id) => `/admin/site/newsletter/promo/${id}`}
        sendConfirmText="지금 바로 등록된 대상자 전체에게 발송하시겠습니까?"
      />
    </div>
  );
}
