import Link from "next/link";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteBoardPost, deleteBoardPosts } from "./actions";
import PostsTable from "./PostsTable";
import { PAGE_SIZE_OPTIONS, type AdminPostRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function AdminBoardPostsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = createAdminClient();

  const [{ data: board }, { data: posts, error, count }, { data: categories }] = await Promise.all([
    supabase
      .from("boards")
      .select("id, name, use_category, use_comment, column_only")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("board_posts")
      .select(
        "id, title, status, created_at, category_id, is_notice, author, view_count, newsletter_use_count, newsletter_last_used_at, newsletter_published",
        { count: "exact" },
      )
      .eq("board_id", id)
      .order("is_notice", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase.from("board_categories").select("id, name").eq("board_id", id),
  ]);

  if (!board) notFound();

  // Fetch comment counts after we know post IDs
  const postIds = (posts ?? []).map((p) => p.id);
  const { data: commentData } =
    postIds.length > 0
      ? await supabase.from("board_comments").select("post_id").in("post_id", postIds)
      : { data: [] };

  const commentCountMap = new Map<string, number>();
  for (const c of commentData ?? []) {
    commentCountMap.set(c.post_id, (commentCountMap.get(c.post_id) ?? 0) + 1);
  }

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: AdminPostRow[] = (posts ?? []).map((p, i) => ({
    id: p.id,
    number: totalCount - offset - i,
    title: p.title,
    author: p.author,
    createdAt: p.created_at,
    viewCount: p.view_count ?? 0,
    status: p.status,
    isNotice: p.is_notice,
    categoryName: p.category_id ? categoryMap.get(p.category_id) ?? null : null,
    commentCount: commentCountMap.get(p.id) ?? 0,
    newsletterUseCount: p.newsletter_use_count ?? 0,
    newsletterLastUsedAt: p.newsletter_last_used_at,
    newsletterPublished: p.newsletter_published ?? false,
  }));

  return (
    <div>
      <PageHeader
        title={`${board.name} — 게시물 목록`}
        description={`총 ${totalCount}개의 게시물이 있습니다.`}
        actionHref={`/admin/site/board/${id}/posts/new`}
        actionLabel="글쓰기"
        actions={
          board.use_category ? (
            <Link
              href={`/admin/site/board/${id}/categories`}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Tag size={15} />
              카테고리 관리
            </Link>
          ) : undefined
        }
      />

      {error && (
        <p className="text-sm text-destructive mb-4">
          게시물을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <PostsTable
        boardId={id}
        posts={rows}
        useCategory={board.use_category}
        showNewsletterUsage={board.column_only}
        page={page}
        limit={limit}
        totalPages={totalPages}
        deletePostAction={deleteBoardPost}
        deletePostsAction={deleteBoardPosts}
      />
    </div>
  );
}
