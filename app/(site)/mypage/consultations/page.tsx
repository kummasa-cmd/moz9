import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ConsultationsList from "./ConsultationsList";
import { PAGE_SIZE_OPTIONS, type MyConsultationRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function ConsultationsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: consultations, count } = await admin
    .from("consultations")
    .select("id, subject, status, created_at", { count: "exact" })
    .eq("member_id", user!.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: MyConsultationRow[] = (consultations ?? []).map((c, i) => ({
    id: c.id,
    number: totalCount - offset - i,
    subject: c.subject,
    status: c.status,
    createdAt: c.created_at,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">상담 내역</h1>
        <Link
          href="/mypage/consultations/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} />
          상담 신청
        </Link>
      </div>

      <ConsultationsList consultations={rows} page={page} limit={limit} totalPages={totalPages} />
    </div>
  );
}
