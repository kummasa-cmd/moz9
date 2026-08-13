import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MessageCircle, CreditCard, Newspaper, ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SECTION_LABELS: Record<string, string> = {
  column: "컬럼",
  series: "연재",
  info: "정보",
  ad: "광고",
};

export default async function MypageDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const [{ data: member }, { data: columnBoards }] = await Promise.all([
    admin.from("members").select("id, nickname, created_at").eq("user_id", user!.id).maybeSingle(),
    admin.from("boards").select("id, slug, name").eq("column_only", true),
  ]);

  const columnBoardIds = (columnBoards ?? []).map((b) => b.id);
  const columnBoardMap = new Map((columnBoards ?? []).map((b) => [b.id, b]));

  const [{ count: consultationCount }, { count: paymentCount }, { count: columnPostCount }, { data: recentColumnPosts }] =
    await Promise.all([
      admin.from("consultations").select("*", { count: "exact", head: true }).eq("member_id", user!.id),
      member
        ? admin
            .from("orders")
            .select("*", { count: "exact", head: true })
            .eq("manager_member_id", member.id)
            .eq("is_active", true)
        : Promise.resolve({ count: 0 }),
      columnBoardIds.length
        ? admin
            .from("board_posts")
            .select("*", { count: "exact", head: true })
            .in("board_id", columnBoardIds)
            .eq("user_id", user!.id)
            .eq("status", "게시중")
        : Promise.resolve({ count: 0 }),
      columnBoardIds.length
        ? admin
            .from("board_posts")
            .select("id, title, created_at, board_id, category_id")
            .in("board_id", columnBoardIds)
            .eq("user_id", user!.id)
            .eq("status", "게시중")
            .order("created_at", { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);

  const categoryIds = Array.from(
    new Set((recentColumnPosts ?? []).map((p) => p.category_id).filter((v): v is string => Boolean(v)))
  );
  const { data: categories } = categoryIds.length
    ? await admin.from("board_categories").select("id, name").in("id", categoryIds)
    : { data: [] };
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c.name]));

  const recentColumnRows = (recentColumnPosts ?? []).map((p, index) => {
    const board = columnBoardMap.get(p.board_id);
    return {
      id: p.id,
      slug: board?.slug ?? "",
      number: (recentColumnPosts?.length ?? 0) - index,
      section: SECTION_LABELS[board?.slug ?? ""] ?? board?.name ?? "-",
      category: p.category_id ? categoryMap.get(p.category_id) ?? "-" : "-",
      title: p.title,
      createdAt: p.created_at,
    };
  });

  const joinDate = member?.created_at
    ? new Date(member.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })
    : "";

  const stats = [
    {
      label: "상담 내역",
      value: consultationCount ?? 0,
      unit: "건",
      href: "/mypage/consultations",
      icon: MessageCircle,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "컬럼 게시판",
      value: columnPostCount ?? 0,
      unit: "건",
      href: "/mypage/column",
      icon: Newspaper,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "결제 내역",
      value: paymentCount ?? 0,
      unit: "건",
      href: "/mypage/payments",
      icon: CreditCard,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="rounded-xl border border-border bg-white px-6 py-5">
        <p className="text-sm text-muted-foreground">안녕하세요,</p>
        <h1 className="text-xl font-bold text-foreground mt-0.5">
          {member?.nickname ?? ""}님 <span className="text-muted-foreground font-normal text-base">반갑습니다.</span>
        </h1>
        {joinDate && (
          <p className="text-xs text-muted-foreground mt-1">{joinDate} 가입</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-xl border border-border bg-white px-5 py-5 hover:shadow-sm transition-shadow group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${s.bg}`}>
                <s.icon size={18} className={s.color} />
              </div>
              <ArrowRight size={14} className="text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
            <p className="text-2xl font-bold text-foreground">
              {s.value.toLocaleString()}
              <span className="text-sm font-normal text-muted-foreground ml-1">{s.unit}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-0.5">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Recent column board posts */}
      {recentColumnRows.length > 0 && (
        <div className="rounded-xl border border-border bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">최근 컬럼 게시판 글</h2>
            <Link
              href="/mypage/column"
              className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              전체보기 <ArrowRight size={12} />
            </Link>
          </div>

          <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">번호</TableHead>
                  <TableHead className="w-20">구분</TableHead>
                  <TableHead className="w-28">카테고리</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-28">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentColumnRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">{r.number}</TableCell>
                    <TableCell className="text-muted-foreground">{r.section}</TableCell>
                    <TableCell className="text-muted-foreground">{r.category}</TableCell>
                    <TableCell>
                      <Link
                        href={`/community/${r.slug}/${r.id}`}
                        className="text-foreground hover:text-primary hover:underline"
                      >
                        {r.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Quick links */}
      <div className="rounded-xl border border-border bg-white px-6 py-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">바로가기</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/mypage/consultations/new"
            className="rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:border-primary hover:text-primary transition-colors text-center"
          >
            상담 신청하기
          </Link>
          <Link
            href="/community"
            className="rounded-lg border border-border px-4 py-3 text-sm text-foreground hover:border-primary hover:text-primary transition-colors text-center"
          >
            커뮤니티 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
