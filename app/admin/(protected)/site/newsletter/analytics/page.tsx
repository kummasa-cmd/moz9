import { Users, Eye, Mail, Send, MailOpen, MousePointerClick } from "lucide-react";
import StatCard from "@/components/admin/StatCard";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/admin/PageHeader";
import { TrendChart } from "@/components/admin/newsletter/TrendChart";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBSCRIBER_SOURCE_LABEL } from "../labels";

const TREND_DAYS = 30;

function bucketByDay(dates: (string | null)[], days: number): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }

  for (const raw of dates) {
    if (!raw) continue;
    const key = raw.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

function formatPercent(numerator: number, denominator: number): string {
  if (denominator === 0) return "-";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function AdminNewsletterAnalyticsPage() {
  const supabase = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - (TREND_DAYS - 1));
  const sinceIso = since.toISOString();

  const [
    { count: subscribedCount },
    { count: unsubscribedCount },
    { count: sentCampaignCount },
    { count: totalDeliveredCount },
    { count: totalOpenedCount },
    { count: totalClickedCount },
    { data: subscribersBySource },
    { data: topNewsletters },
    { data: recentCampaigns },
    { data: sentDates },
    { data: subscribedDates },
  ] = await Promise.all([
    supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "SUBSCRIBED"),
    supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "UNSUBSCRIBED"),
    supabase
      .from("newsletter_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("status", "SENT"),
    supabase.from("newsletter_deliveries").select("*", { count: "exact", head: true }).not("sent_at", "is", null),
    supabase.from("newsletter_deliveries").select("*", { count: "exact", head: true }).not("opened_at", "is", null),
    supabase.from("newsletter_deliveries").select("*", { count: "exact", head: true }).eq("status", "CLICKED"),
    supabase.from("newsletter_subscribers").select("source"),
    supabase
      .from("newsletters")
      .select("id, title, view_count, published_at")
      .order("view_count", { ascending: false })
      .limit(10),
    supabase
      .from("newsletter_campaigns")
      .select("id, name, newsletter_id, status, sent_at, total_recipients, total_sent")
      .gt("total_sent", 0)
      .order("sent_at", { ascending: false })
      .limit(10),
    supabase.from("newsletter_deliveries").select("sent_at").not("sent_at", "is", null).gte("sent_at", sinceIso),
    supabase.from("newsletter_subscribers").select("subscribed_at").gte("subscribed_at", sinceIso),
  ]);

  const sourceCounts = new Map<string, number>();
  for (const row of subscribersBySource ?? []) {
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  }

  const totalViews = (topNewsletters ?? []).reduce((sum, n) => sum + (n.view_count ?? 0), 0);

  const campaigns = recentCampaigns ?? [];
  const campaignIds = campaigns.map((c) => c.id);
  const newsletterIds = [...new Set(campaigns.map((c) => c.newsletter_id))];

  const [{ data: campaignDeliveries }, { data: campaignNewsletters }] = await Promise.all([
    campaignIds.length
      ? supabase.from("newsletter_deliveries").select("campaign_id, status, opened_at").in("campaign_id", campaignIds)
      : Promise.resolve({ data: [] as { campaign_id: string; status: string; opened_at: string | null }[] }),
    newsletterIds.length
      ? supabase.from("newsletters").select("id, title").in("id", newsletterIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const titleByNewsletterId = new Map((campaignNewsletters ?? []).map((n) => [n.id, n.title]));

  const performanceByCampaignId = new Map<string, { opened: number; clicked: number }>();
  for (const d of campaignDeliveries ?? []) {
    const entry = performanceByCampaignId.get(d.campaign_id) ?? { opened: 0, clicked: 0 };
    if (d.opened_at) entry.opened += 1;
    if (d.status === "CLICKED") entry.clicked += 1;
    performanceByCampaignId.set(d.campaign_id, entry);
  }

  const sendTrend = bucketByDay((sentDates ?? []).map((d) => d.sent_at), TREND_DAYS);
  const subscriberTrend = bucketByDay((subscribedDates ?? []).map((d) => d.subscribed_at), TREND_DAYS);

  const stats = [
    { label: "구독중인 대상", value: `${subscribedCount ?? 0}명`, icon: Users },
    { label: "수신거부", value: `${unsubscribedCount ?? 0}명`, icon: Mail },
    { label: "발송 완료 캠페인", value: `${sentCampaignCount ?? 0}건`, icon: Send },
    { label: "발행 뉴스레터 총 조회수", value: `${totalViews.toLocaleString()}회`, icon: Eye },
    {
      label: "평균 오픈율",
      value: formatPercent(totalOpenedCount ?? 0, totalDeliveredCount ?? 0),
      hint: `${(totalOpenedCount ?? 0).toLocaleString()} / ${(totalDeliveredCount ?? 0).toLocaleString()}건`,
      icon: MailOpen,
    },
    {
      label: "평균 클릭율",
      value: formatPercent(totalClickedCount ?? 0, totalDeliveredCount ?? 0),
      hint: `${(totalClickedCount ?? 0).toLocaleString()} / ${(totalDeliveredCount ?? 0).toLocaleString()}건`,
      icon: MousePointerClick,
    },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader title="통계" description="구독자, 발송, 열람/클릭 현황을 한눈에 확인합니다." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <StatCard key={s.label} {...s} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-foreground mb-4">날짜별 발송량 (최근 {TREND_DAYS}일)</h3>
          <TrendChart data={sendTrend} />
        </div>
        <div className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-foreground mb-4">날짜별 신규 구독자 (최근 {TREND_DAYS}일)</h3>
          <TrendChart data={subscriberTrend} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-5 mb-6">
        <h3 className="font-semibold text-foreground mb-4">캠페인별 발송 성과</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>캠페인</TableHead>
              <TableHead>뉴스레터</TableHead>
              <TableHead>발송일</TableHead>
              <TableHead>발송수</TableHead>
              <TableHead>오픈율</TableHead>
              <TableHead>클릭율</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => {
              const perf = performanceByCampaignId.get(c.id) ?? { opened: 0, clicked: 0 };
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {titleByNewsletterId.get(c.newsletter_id) ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.sent_at ? new Date(c.sent_at).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{(c.total_sent ?? 0).toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPercent(perf.opened, c.total_sent ?? 0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatPercent(perf.clicked, c.total_sent ?? 0)}
                  </TableCell>
                </TableRow>
              );
            })}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  발송된 캠페인이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-foreground mb-4">조회수 상위 뉴스레터</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>조회수</TableHead>
                <TableHead>발행일</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(topNewsletters ?? []).map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="font-medium">{n.title}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {(n.view_count ?? 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {n.published_at ? new Date(n.published_at).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                </TableRow>
              ))}
              {(!topNewsletters || topNewsletters.length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="rounded-xl border border-border bg-white p-5">
          <h3 className="font-semibold text-foreground mb-4">구독자 등록 경로</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>경로</TableHead>
                <TableHead>인원</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...sourceCounts.entries()].map(([source, count]) => (
                <TableRow key={source}>
                  <TableCell className="font-medium">
                    {SUBSCRIBER_SOURCE_LABEL[source] ?? source}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{count.toLocaleString()}명</TableCell>
                </TableRow>
              ))}
              {sourceCounts.size === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
