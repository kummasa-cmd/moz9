import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ColumnPostsList from "./ColumnPostsList";
import { PAGE_SIZE_OPTIONS, type MyColumnPostRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

const SECTION_LABELS: Record<string, string> = {
  column: "컬럼",
  series: "연재",
  info: "정보",
  ad: "광고",
};

type Props = {
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function MyColumnPostsPage({ searchParams }: Props) {
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit)) ? Number(sp.limit) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: boards } = await admin.from("boards").select("id, slug, name").eq("column_only", true);

  const boardIds = (boards ?? []).map((b) => b.id);
  const boardMap = new Map((boards ?? []).map((b) => [b.id, b]));

  const { data: posts, count } = boardIds.length
    ? await admin
        .from("board_posts")
        .select("id, title, created_at, board_id, category_id", { count: "exact" })
        .in("board_id", boardIds)
        .eq("user_id", user!.id)
        .eq("status", "게시중")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)
    : { data: [], count: 0 };

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const categoryIds = Array.from(
    new Set((posts ?? []).map((p) => p.category_id).filter((v): v is string => Boolean(v)))
  );
  const { data: categories } = categoryIds.length
    ? await admin.from("board_categories").select("id, name").in("id", categoryIds)
    : { data: [] };
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const rows: MyColumnPostRow[] = (posts ?? []).map((p, index) => {
    const board = boardMap.get(p.board_id);
    return {
      id: p.id,
      slug: board?.slug ?? "",
      number: totalCount - offset - index,
      section: SECTION_LABELS[board?.slug ?? ""] ?? board?.name ?? "-",
      category: p.category_id ? categoryMap.get(p.category_id) ?? "-" : "-",
      title: p.title,
      createdAt: p.created_at,
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-foreground">컬럼 게시판</h1>

      {rows.length > 0 ? (
        <ColumnPostsList posts={rows} page={page} limit={limit} totalPages={totalPages} />
      ) : (
        <div className="rounded-xl border border-border bg-white flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText size={40} className="mb-3 opacity-30" />
          <p className="text-sm">작성한 글이 없습니다.</p>
          <p className="text-xs mt-1 opacity-70">컬럼/연재/정보/광고 게시판에 글을 작성하면 여기에 표시됩니다.</p>
        </div>
      )}
    </div>
  );
}
