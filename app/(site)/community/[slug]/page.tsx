import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Pencil, Lock, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isColumnMember } from "@/lib/community-auth";
import { deletePost, deletePosts } from "./actions";
import PostsList from "./PostsList";
import { PAGE_SIZE_OPTIONS, type CommunityPostRow } from "./types";

const DEFAULT_PAGE_SIZE = 10;

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
};

export default async function CommunityBoardPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;

  const limit = PAGE_SIZE_OPTIONS.includes(Number(sp.limit))
    ? Number(sp.limit)
    : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp.page) || 1);
  const offset = (page - 1) * limit;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = await isAdmin();
  const db = createAdminClient();

  const { data: board } = await db
    .from("boards")
    .select("id, name, slug, type, allow_user_write, use_category, column_only")
    .eq("slug", slug)
    .eq("is_visible", true)
    .maybeSingle();

  if (!board) notFound();

  if (board.column_only && !admin) {
    if (!user) redirect(`/login?next=/community/${slug}`);
    if (!(await isColumnMember(user.id))) {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <p className="text-muted-foreground">컬럼 회원만 이용할 수 있습니다.</p>
        </div>
      );
    }
  }

  const isPrivate = board.type === "개인";

  let query = db
    .from("board_posts")
    .select("id, title, author, created_at, is_notice, view_count, status, user_id", {
      count: "exact",
    })
    .eq("board_id", board.id)
    .eq("status", "게시중")
    .order("is_notice", { ascending: false })
    .order("created_at", { ascending: false });

  if (isPrivate && !admin) {
    if (user) {
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("user_id", "00000000-0000-0000-0000-000000000000");
    }
  }

  const { data: posts, count } = await query.range(offset, offset + limit - 1);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const rows: CommunityPostRow[] = (posts ?? []).map((post) => ({
    id: post.id,
    title: post.title,
    author: post.author,
    createdAt: post.created_at,
    isNotice: post.is_notice,
    viewCount: post.view_count ?? 0,
    editable: admin || (board.allow_user_write && user !== null && user.id === post.user_id),
  }));

  const canBulkDelete = admin || (board.allow_user_write && user !== null);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Back + Header */}
      <div className="mb-6">
        <Link
          href="/community"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft size={14} />
          커뮤니티
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPrivate && <Lock size={16} className="text-muted-foreground" />}
            <h1 className="text-2xl font-bold text-foreground">{board.name}</h1>
          </div>
          {board.allow_user_write && user && (
            <Link
              href={`/community/${slug}/new`}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Pencil size={14} />
              글쓰기
            </Link>
          )}
        </div>
        {isPrivate && !admin && user && (
          <p className="text-xs text-muted-foreground mt-1">내가 작성한 글만 표시됩니다.</p>
        )}
        {isPrivate && !user && (
          <p className="text-xs text-muted-foreground mt-1">
            <Link href={`/login?next=/community/${slug}`} className="text-primary hover:underline">
              로그인
            </Link>
            {" "}후 이용할 수 있습니다.
          </p>
        )}
      </div>

      {/* Post list */}
      <PostsList
        slug={slug}
        posts={rows}
        canBulkDelete={canBulkDelete}
        page={page}
        limit={limit}
        totalPages={totalPages}
        deletePostAction={deletePost}
        deletePostsAction={deletePosts}
      />
    </div>
  );
}
