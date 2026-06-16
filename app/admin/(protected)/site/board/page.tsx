import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
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
import { deletePost } from "./actions";

export default async function AdminSiteBoardPage() {
  const supabase = await createClient();
  const { data: posts, error } = await supabase
    .from("board_posts")
    .select("id, board, title, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader
        title="게시판관리"
        description="공지사항·자주 묻는 질문 게시판 글을 관리합니다."
        actionHref="/admin/site/board/new"
        actionLabel="새 글 작성"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">게시물을 불러오지 못했습니다: {error.message}</p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>게시판</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(posts ?? []).map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{p.board}</TableCell>
                <TableCell className="font-medium">{p.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(p.created_at).toLocaleDateString("ko-KR")}
                </TableCell>
                <TableCell>
                  <Badge variant={p.status === "게시중" ? "default" : "secondary"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-3">
                    <Link
                      href={`/admin/site/board/${p.id}/edit`}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      aria-label="수정"
                    >
                      <Pencil size={15} />
                    </Link>
                    <form action={deletePost}>
                      <input type="hidden" name="id" value={p.id} />
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
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
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
