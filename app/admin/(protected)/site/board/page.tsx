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
import { deleteBoard } from "./actions";

export default async function AdminSiteBoardPage() {
  const supabase = await createClient();

  const [{ data: boards, error }, { data: postCountData }] = await Promise.all([
    supabase.from("boards").select("*").order("sort_order", { ascending: true }),
    supabase.from("board_posts").select("board_id").not("board_id", "is", null),
  ]);

  const countMap = new Map<string, number>();
  for (const p of postCountData ?? []) {
    if (p.board_id) countMap.set(p.board_id, (countMap.get(p.board_id) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="게시판 관리"
        description={`전체 ${boards?.length ?? 0}개의 게시판이 등록되어 있습니다.`}
        actionHref="/admin/site/board/new"
        actionLabel="게시판 추가"
      />

      {error && (
        <p className="text-sm text-destructive mb-4">
          게시판 목록을 불러오지 못했습니다: {error.message}
        </p>
      )}

      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">순서</TableHead>
              <TableHead>게시판명</TableHead>
              <TableHead>슬러그</TableHead>
              <TableHead>유형</TableHead>
              <TableHead className="text-center">게시물수</TableHead>
              <TableHead className="text-center">노출</TableHead>
              <TableHead className="text-center">사용자입력</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(boards ?? []).map((b) => {
              const postCount = countMap.get(b.id) ?? 0;
              return (
                <TableRow key={b.id}>
                  <TableCell className="text-center text-muted-foreground">{b.sort_order}</TableCell>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {b.slug}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={b.type === "일반" ? "default" : "secondary"}>{b.type}</Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Link
                      href={`/admin/site/board/${b.id}/posts`}
                      className="text-primary hover:underline font-medium tabular-nums"
                    >
                      {postCount}
                    </Link>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={b.is_visible ? "default" : "secondary"}>
                      {b.is_visible ? "노출" : "숨김"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={b.allow_user_write ? "default" : "secondary"}>
                      {b.allow_user_write ? "가능" : "불가"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-3">
                      <Link
                        href={`/admin/site/board/${b.id}/edit`}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        aria-label="수정"
                      >
                        <Pencil size={15} />
                      </Link>
                      <form action={deleteBoard}>
                        <input type="hidden" name="id" value={b.id} />
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
              );
            })}

            {boards && boards.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                  등록된 게시판이 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
