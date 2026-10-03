import Link from "next/link";
import { Users, Eye, Mail, MailCheck, Send, MailOpen, MousePointerClick, Megaphone } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  broadcastSummaryStats,
  buildCampaignPerformanceRows,
  dailySendTimestamps,
  isAnalyticsCampaign,
  type BroadcastSentEventInput,
  type BroadcastStatsRow,
  type DeliveryPath,
} from "@/lib/newsletter/campaign-stats";
import { SUBSCRIBER_SOURCE_LABEL } from "../labels";

const TREND_DAYS = 30;
const RECENT_CAMPAIGN_LIMIT = 10;
const NO_BROADCAST_HINT = "아직 Broadcast 발송 없음";

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

// Same output as formatPercent for a rate from lib/newsletter/campaign-stats.ts.
function formatRate(rate: number | null): string {
  return rate === null ? "-" : `${(rate * 100).toFixed(1)}%`;
}

const DELIVERY_PATH_BADGE: Record<DeliveryPath, { label: string; title: string }> = {
  legacy: { label: "Legacy", title: "개별 발송(batch) — 자체 오픈/클릭 추적 기준" },
  broadcast: { label: "Broadcast", title: "Resend Broadcast — 메일 서비스 이벤트 기준" },
  mixed: { label: "혼합", title: "Legacy와 Broadcast 회차가 섞여 있어 하나의 수치로 합산하지 않습니다" },
  none: { label: "확인 필요", title: "발송 기록(Legacy 발송 행 또는 발송된 Broadcast)이 없습니다" },
};

export default async function AdminNewsletterAnalyticsPage() {
  const supabase = createAdminClient();

  const since = new Date();
  since.setDate(since.getDate() - (TREND_DAYS - 1));
  const sinceIso = since.toISOString();

  const [
    { count: subscribedCount },
    { count: unsubscribedCount },
    { data: sentCampaigns },
    { count: totalDeliveredCount },
    { count: totalOpenedCount },
    { count: totalClickedCount },
    { data: subscribersBySource },
    { data: topNewsletters },
    { data: recentCampaigns },
    { data: sentDates },
    { data: subscribedDates },
    { data: broadcastSentEvents },
  ] = await Promise.all([
    supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "SUBSCRIBED"),
    supabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "UNSUBSCRIBED"),
    // Rows, not a head count, so B2 test campaigns can be left out with the
    // shared predicate (isAnalyticsCampaign) below.
    supabase
      .from("newsletter_campaigns")
      .select("send_type, scheduled_at")
      .in("status", ["SENT", "PARTIAL"])
      .eq("audience", "SUBSCRIBERS"),
    // prospect_id is only ever set on deliveries sent to the promotional
    // audience (see lib/newsletter/scheduler.ts::processCampaign) — filtering
    // it out here keeps this page's numbers subscriber-only. Promotional
    // performance lives on its own page: promo/analytics/page.tsx.
    supabase
      .from("newsletter_deliveries")
      .select("*", { count: "exact", head: true })
      .not("sent_at", "is", null)
      .is("prospect_id", null),
    supabase
      .from("newsletter_deliveries")
      .select("*", { count: "exact", head: true })
      .not("opened_at", "is", null)
      .is("prospect_id", null),
    supabase
      .from("newsletter_deliveries")
      .select("*", { count: "exact", head: true })
      .eq("status", "CLICKED")
      .is("prospect_id", null),
    supabase.from("newsletter_subscribers").select("source"),
    supabase
      .from("newsletters")
      .select("id, title, view_count, published_at")
      .eq("newsletter_type", "REGULAR")
      .order("view_count", { ascending: false })
      .limit(10),
    // No .limit(): test campaigns are dropped afterwards and the table keeps
    // RECENT_CAMPAIGN_LIMIT real ones (buildCampaignPerformanceRows).
    supabase
      .from("newsletter_campaigns")
      .select("id, name, newsletter_id, status, sent_at, send_type, scheduled_at, total_recipients, total_sent")
      .eq("audience", "SUBSCRIBERS")
      .gt("total_sent", 0)
      .order("sent_at", { ascending: false }),
    supabase
      .from("newsletter_deliveries")
      .select("sent_at")
      .not("sent_at", "is", null)
      .is("prospect_id", null)
      .gte("sent_at", sinceIso),
    supabase.from("newsletter_subscribers").select("subscribed_at").gte("subscribed_at", sinceIso),
    // Broadcast emails sent in the trend window: processed email.sent events
    // linked to a run (dailySendTimestamps keeps analytics campaigns only).
    supabase
      .from("newsletter_webhook_events")
      .select("broadcast_send_id, email_id, event_created_at, received_at")
      .eq("event_type", "email.sent")
      .eq("status", "PROCESSED")
      .not("broadcast_send_id", "is", null)
      .gte("received_at", sinceIso),
  ]);

  const sourceCounts = new Map<string, number>();
  for (const row of subscribersBySource ?? []) {
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  }

  const totalViews = (topNewsletters ?? []).reduce((sum, n) => sum + (n.view_count ?? 0), 0);

  // Every subscriber campaign that went out (a sent Broadcast also sets
  // total_sent). Test campaigns (B2) are left out of the table here and of
  // the Broadcast summary / trend by the helpers.
  const subscriberCampaigns = recentCampaigns ?? [];
  const subscriberCampaignIds = subscriberCampaigns.map((c) => c.id);
  const campaigns = subscriberCampaigns.filter(isAnalyticsCampaign).slice(0, RECENT_CAMPAIGN_LIMIT);
  const campaignIds = campaigns.map((c) => c.id);
  const newsletterIds = [...new Set(campaigns.map((c) => c.newsletter_id))];

  // One batch per source (no per-row queries): legacy deliveries of the
  // listed campaigns; Broadcast runs and their stats (0029 view) of all
  // subscriber campaigns, for the table, the summary cards and the trend.
  const [{ data: campaignDeliveries }, { data: campaignRuns }, { data: campaignRunStats }, { data: campaignNewsletters }] =
    await Promise.all([
      campaignIds.length
        ? supabase.from("newsletter_deliveries").select("campaign_id, status, sent_at, opened_at").in("campaign_id", campaignIds)
        : Promise.resolve({ data: [] as { campaign_id: string; status: string; sent_at: string | null; opened_at: string | null }[] }),
      subscriberCampaignIds.length
        ? supabase
            .from("newsletter_broadcast_sends")
            .select("id, campaign_id, run_key, status, resend_broadcast_id")
            .in("campaign_id", subscriberCampaignIds)
        : Promise.resolve({
            data: [] as { id: string; campaign_id: string; run_key: string; status: string; resend_broadcast_id: string | null }[],
          }),
      subscriberCampaignIds.length
        ? supabase.from("newsletter_broadcast_stats").select("*").in("campaign_id", subscriberCampaignIds)
        : Promise.resolve({ data: [] as BroadcastStatsRow[] }),
      newsletterIds.length
        ? supabase.from("newsletters").select("id, title").in("id", newsletterIds)
        : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ]);

  const titleByNewsletterId = new Map((campaignNewsletters ?? []).map((n) => [n.id, n.title]));

  const performanceRows = buildCampaignPerformanceRows({
    campaigns,
    deliveries: campaignDeliveries ?? [],
    broadcastRuns: campaignRuns ?? [],
    broadcastStats: (campaignRunStats ?? []) as BroadcastStatsRow[],
  });

  const sentCampaignCount = (sentCampaigns ?? []).filter(isAnalyticsCampaign).length;

  // Broadcast-only summary (null until a real Broadcast has gone out). Kept
  // apart from the legacy average cards: the two measure opens differently.
  const broadcastSummary = broadcastSummaryStats({
    campaigns: subscriberCampaigns,
    broadcastRuns: campaignRuns ?? [],
    broadcastStats: (campaignRunStats ?? []) as BroadcastStatsRow[],
  });

  // Emails sent per day: legacy delivery rows + Broadcast email.sent events.
  const sendTrend = bucketByDay(
    dailySendTimestamps({
      legacySentAt: (sentDates ?? []).map((d) => d.sent_at),
      broadcastSentEvents: (broadcastSentEvents ?? []) as BroadcastSentEventInput[],
      broadcastRuns: campaignRuns ?? [],
      campaigns: subscriberCampaigns,
      since,
    }),
    TREND_DAYS,
  );
  const subscriberTrend = bucketByDay((subscribedDates ?? []).map((d) => d.subscribed_at), TREND_DAYS);

  const stats = [
    { label: "구독중인 대상", value: `${subscribedCount ?? 0}명`, icon: Users },
    { label: "수신거부", value: `${unsubscribedCount ?? 0}명`, icon: Mail },
    { label: "발송 완료 캠페인", value: `${sentCampaignCount}건`, icon: Send },
    { label: "발행 뉴스레터 총 조회수", value: `${totalViews.toLocaleString()}회`, icon: Eye },
    {
      label: "평균 오픈율",
      value: formatPercent(totalOpenedCount ?? 0, totalDeliveredCount ?? 0),
      hint: `${(totalOpenedCount ?? 0).toLocaleString()} / ${(totalDeliveredCount ?? 0).toLocaleString()}건 · Legacy 발송 기준`,
      icon: MailOpen,
    },
    {
      label: "평균 클릭율",
      value: formatPercent(totalClickedCount ?? 0, totalDeliveredCount ?? 0),
      hint: `${(totalClickedCount ?? 0).toLocaleString()} / ${(totalDeliveredCount ?? 0).toLocaleString()}건 · Legacy 발송 기준`,
      icon: MousePointerClick,
    },
    // Broadcast (Resend events), never merged with the legacy cards above.
    // "-" until a real Broadcast has gone out — not a 0.0% result.
    {
      label: "Broadcast 전달률",
      value: formatRate(broadcastSummary?.deliveryRate ?? null),
      hint: broadcastSummary
        ? `${broadcastSummary.delivered.toLocaleString()} / ${broadcastSummary.sent.toLocaleString()}건 · 전달 / 발송`
        : NO_BROADCAST_HINT,
      icon: MailCheck,
    },
    {
      label: "Broadcast 오픈율",
      value: formatRate(broadcastSummary?.openRate ?? null),
      hint: broadcastSummary
        ? `${broadcastSummary.uniqueOpensPerRunSum.toLocaleString()} / ${broadcastSummary.delivered.toLocaleString()}건 · 참고 지표`
        : NO_BROADCAST_HINT,
      icon: MailOpen,
    },
    {
      label: "Broadcast 클릭율",
      value: formatRate(broadcastSummary?.clickRate ?? null),
      hint: broadcastSummary
        ? `${broadcastSummary.uniqueClicksPerRunSum.toLocaleString()} / ${broadcastSummary.delivered.toLocaleString()}건 · 전달 대비`
        : NO_BROADCAST_HINT,
      icon: MousePointerClick,
    },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="통계"
        description="구독자, 발송, 열람/클릭 현황을 한눈에 확인합니다. (홍보 뉴스레터 발송 실적은 별도 페이지에서 확인하세요)"
        actions={
          <Link
            href="/admin/site/newsletter/promo/analytics"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            <Megaphone size={14} />
            홍보 뉴스레터 통계
          </Link>
        }
      />

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
        <h3 className="font-semibold text-foreground mb-1">캠페인별 발송 성과</h3>
        <p className="text-xs text-muted-foreground mb-4">
          오픈율은 메일 서비스의 이미지 차단·프록시 등에 따라 실제보다 낮거나 다르게 측정될 수 있는 참고 지표입니다.
          Broadcast 캠페인은 메일 서비스 이벤트 기준(발송 확인 수, 전달 대비 비율)이며, Legacy와 측정 방식이 다릅니다.
        </p>
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
            {performanceRows.map((row) => {
              const badge = DELIVERY_PATH_BADGE[row.path];
              return (
                <TableRow key={row.campaignId}>
                  <TableCell className="font-medium">
                    <span className="mr-2">{row.name}</span>
                    <Badge variant={row.path === "legacy" ? "outline" : "secondary"} title={badge.title}>
                      {badge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {titleByNewsletterId.get(row.newsletterId) ?? "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.sentAt ? new Date(row.sentAt).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.sent === null ? "-" : row.sent.toLocaleString()}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRate(row.openRate)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRate(row.clickRate)}</TableCell>
                </TableRow>
              );
            })}
            {performanceRows.length === 0 && (
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
