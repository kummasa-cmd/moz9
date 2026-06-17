import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/admin/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { deleteBoardPost } from "./actions";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminBoardPostsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: board }, { data: posts, error }, { data: categories }] = await Promise.all([
    supabase.from("boards").select("id, name, use_category, use_comment").eq("id", id).maybeSingle(),
    supabase
      .from("board_posts")
      .select("id, title, status, created_at, category_id, is_notice, author, view_count")
      .eq("board_id", id)
      .order("is_notice", { ascending: false })
      .order("created_at", { ascending: false }),
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
  const colCount = board.use_category ? 7 : 6;

  return (
    <div>
      <PageHeader
        title={`${board.name} — 게시물 목록`}
        description={`총 ${posts?.length ?? 0}개의 게시물이 있습니다.`}
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

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {board.use_category && <TableHead className="w-28">카테고리</TableHead>}
              <TableHead>제목</TableHead>
              <TableHead className="w-24">작성자</TableHead>
              <TableHead className="w-28">등록일</TableHead>
              <TableHead className="w-20 text-center">조회수</TableHead>
              <TableHead className="w-20">상태</TableHead>
              <TableHead className="text-right w-20">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(posts ?? []).map((p) => (
              <TableRow
                key={p.id}
                className={p.is_notice ? "bg-primary/5" : undefined}
              >
                {board.use_category && (
                  <TableCell className="text-muted-foreground text-sm">
                    {p.category_id && categoryMap.has(p.category_id)
                      ? categoryMap.get(p.category_id)
                      : <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {p.is_notice && (
                      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary text-white flex-shrink-0">
                        공지
                      </span>
                    )}
                    <Link
                      href={`/admin/site/board/${id}/posts/${p.id}`}
                      className="hover:text-primary hover:underline transition-colors"
                    >
                      {p.title}
                    </Link>
                    {(commentCountMap.get(p.id) ?? 0) > 0 && (
                      <span className="text-xs text-primary font-medium flex-shrink-0">
                        [{commentCountMap.get(p.id)}]
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {p.author ?? <span className="text-muted-foreground/40">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(p.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {(p.view_count ?? 0).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === "게시중" ? "default" : "secondary"}>
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/site/board/${id}/posts/${p.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deleteBoardPost}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="board_id" value={id} />
                      <button
                        type="submit"
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="삭제"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {posts && posts.length === 0 && (
              <TableRow>
                <TableCell colSpan={colCount} className="text-center text-muted-foreground py-10">
                  등록된 게시물이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
