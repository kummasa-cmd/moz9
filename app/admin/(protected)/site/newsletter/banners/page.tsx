import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteBanner, deleteBanners } from "./actions";
import BannersTable from "./BannersTable";
import type { BannerRow } from "../types";

export default async function AdminNewsletterBannersPage() {
  const supabase = createAdminClient();
  const { data: banners, error } = await supabase
    .from("newsletter_ad_banners")
    .select(
      "id, name, image_url, link_url, position, start_date, end_date, is_active, impressions, clicks",
    )
    .order("created_at", { ascending: false });

  const rows: BannerRow[] = (banners ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    imageUrl: b.image_url,
    linkUrl: b.link_url,
    position: b.position,
    startDate: b.start_date,
    endDate: b.end_date,
    isActive: b.is_active,
    impressions: b.impressions ?? 0,
    clicks: b.clicks ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title="광고 배너"
        description="뉴스레터 이메일과 상세페이지에 노출할 배너를 관리합니다."
        actionHref="/admin/site/newsletter/banners/new"
        actionLabel="배너 등록"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">목록을 불러오지 못했습니다: {error.message}</p>
      )}

      <BannersTable banners={rows} deleteBannerAction={deleteBanner} deleteBannersAction={deleteBanners} />
    </div>
  );
}
