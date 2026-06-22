import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquare, Clock, Lock, ChevronRight, Pencil } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/community-auth";
import FaqSection from "@/components/FaqSection";

export const metadata: Metadata = {
  title: "커뮤니티 | 모즈나인",
  description: "모즈나인 커뮤니티 게시판 최신 소식을 확인하세요.",
};

export default async function CommunityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = await isAdmin();
  const db = createAdminClient();

  const { data: boards } = await db
    .from("boards")
    .select("id, name, slug, type, allow_user_write")
    .eq("is_visible", true)
    .order("sort_order", { ascending: true });

  if (!boards || boards.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-2xl mb-12">
          <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Community</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">커뮤니티</h1>
        </div>
        <p className="text-muted-foreground text-center py-20">운영 중인 게시판이 없습니다.</p>

        <FaqSection />
      </div>
    );
  }

  const boardsWithPosts = await Promise.all(
    boards.map(async (board) => {
      const isPrivate = board.type === "개인";

      let query = db
        .from("board_posts")
        .select("id, title, created_at, is_notice, user_id")
        .eq("board_id", board.id)
        .eq("status", "게시중")
        .order("is_notice", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(5);

      if (isPrivate && !admin) {
        if (user) {
          query = query.eq("user_id", user.id);
        } else {
          query = query.eq("user_id", "00000000-0000-0000-0000-000000000000");
        }
      }

      const { data: posts } = await query;
      return { ...board, posts: posts ?? [], locked: false };
    })
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <div className="max-w-2xl mb-12">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Community</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">커뮤니티</h1>
        <p className="text-muted-foreground leading-relaxed">
          모즈나인 커뮤니티의 최신 소식을 확인하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {boardsWithPosts.map((board) => (
          <div key={board.id} className="rounded-xl border border-border bg-white overflow-hidden">
            {/* Board header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                {board.type === "개인" ? (
                  <Lock size={14} className="text-primary" />
                ) : (
                  <MessageSquare size={14} className="text-primary" />
                )}
                <h2 className="text-sm font-semibold text-foreground">{board.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                {board.allow_user_write && user && (
                  <Link
                    href={`/community/${board.slug}/new`}
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    <Pencil size={11} />
                    글쓰기
                  </Link>
                )}
                <Link
                  href={`/community/${board.slug}`}
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  전체보기 <ChevronRight size={12} />
                </Link>
              </div>
            </div>

            {board.posts.length > 0 ? (
              <ul className="divide-y divide-border">
                {board.posts.map((post) => (
                  <li key={post.id} className="hover:bg-muted/20 transition-colors">
                    <Link
                      href={`/community/${board.slug}/${post.id}`}
                      className="flex items-center justify-between px-5 py-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {post.is_notice && (
                          <span className="flex-shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold bg-primary text-white">
                            공지
                          </span>
                        )}
                        <span className="text-sm text-foreground truncate">{post.title}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 ml-3">
                        <Clock size={11} />
                        {new Date(post.created_at).toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                {board.type === "개인" && !user ? (
                  <>
                    <Link href="/login" className="text-primary hover:underline">로그인</Link>
                    {" "}후 이용할 수 있습니다.
                  </>
                ) : board.type === "개인" ? "작성한 글이 없습니다." : "등록된 게시물이 없습니다."}
              </div>
            )}
          </div>
        ))}
      </div>

      <FaqSection />
    </div>
  );
}
