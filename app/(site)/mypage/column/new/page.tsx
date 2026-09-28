import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isColumnMember } from "@/lib/community-auth";
import NewColumnPostForm from "./NewColumnPostForm";
import { createMyColumnPost } from "./actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function MyColumnNewPostPage({ searchParams }: Props) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/mypage/column/new");

  if (!(await isAdmin()) && !(await isColumnMember(user.id))) notFound();

  const admin = createAdminClient();
  const { data: boards } = await admin
    .from("boards")
    .select("id, slug, name")
    .eq("column_only", true)
    .order("sort_order");

  const boardList = boards ?? [];
  const boardIds = boardList.map((b) => b.id);

  const { data: categories } = boardIds.length
    ? await admin
        .from("board_categories")
        .select("id, board_id, name")
        .in("board_id", boardIds)
        .order("sort_order")
    : { data: [] };

  const categoriesByBoard: Record<string, { id: string; name: string }[]> = {};
  for (const b of boardList) categoriesByBoard[b.slug] = [];
  for (const c of categories ?? []) {
    const board = boardList.find((b) => b.id === c.board_id);
    if (board) categoriesByBoard[board.slug].push({ id: c.id, name: c.name });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/mypage/column" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </Link>
        <h1 className="text-lg font-bold text-foreground">컬럼 게시판 글쓰기</h1>
      </div>

      <NewColumnPostForm
        boards={boardList.map((b) => ({ slug: b.slug, name: b.name }))}
        categoriesByBoard={categoriesByBoard}
        action={createMyColumnPost}
        error={error}
      />
    </div>
  );
}
