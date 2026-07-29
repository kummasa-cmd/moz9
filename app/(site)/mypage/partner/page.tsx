import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import PartnerPostsList from "./PartnerPostsList";
import { PAGE_SIZE_OPTIONS, type PartnerPostRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function PartnerBoardPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: posts, count } = await admin
    .from("partner_posts")
    .select("id, title, status, created_at, processed_at", { count: "exact" })
    .eq("member_id", user!.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: PartnerPostRow[] = (posts ?? []).map((p, i) => ({
    id: p.id,
    number: totalCount - offset - i,
    title: p.title,
    status: p.status,
    createdAt: p.created_at,
    processedAt: p.processed_at,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">거래처 게시판</h1>
        <Link
          href="/mypage/partner/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          문의 등록
        </Link>
      </div>

      <PartnerPostsList posts={rows} page={page} limit={limit} totalPages={totalPages} />
    </div>
  );
}
