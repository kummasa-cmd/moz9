import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, PenLine, Pencil, Trash2, Mail, ThumbsUp, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "컬럼회원 안내 | 모즈나인",
  description: "컬럼회원 가입 방법과 컬럼·연재·정보·광고 게시판 이용 안내",
};

const BOARD_INTROS: Record<
  string,
  { name: string; description: string }
> = {
  column: {
    name: "컬럼",
    description: "본인의 생각과 경험을 담은 단발성 글을 쓰는 공간입니다. 자기계발, 인간관계, 서평, 경제 등 주제는 자유롭습니다.",
  },
  series: {
    name: "연재",
    description: "소설·시·수필·에세이처럼 여러 편으로 이어 쓰는 창작 글을 위한 공간입니다.",
  },
  info: {
    name: "정보",
    description: "글쓰기, 출판, AI, SNS 등 다른 회원에게 도움이 될 만한 실용 정보·노하우를 공유하는 공간입니다.",
  },
  ad: {
    name: "광고",
    description: "본인의 책, 강의, 모임, 챌린지 등을 소개·홍보하는 공간입니다.",
  },
};

const BOARD_ORDER = ["column", "series", "info", "ad"];

export default async function ColumnGuidePage() {
  const db = createAdminClient();

  const { data: boards } = await db
    .from("boards")
    .select("id, slug, name")
    .eq("column_only", true);

  const boardsBySlug = new Map((boards ?? []).map((b) => [b.slug, b]));

  const categoriesByBoardId: Record<string, string[]> = {};
  if (boards && boards.length > 0) {
    const { data: categories } = await db
      .from("board_categories")
      .select("board_id, name, sort_order")
      .in(
        "board_id",
        boards.map((b) => b.id),
      )
      .order("sort_order", { ascending: true });

    for (const c of categories ?? []) {
      const boardId = c.board_id as string;
      if (!categoriesByBoardId[boardId]) categoriesByBoardId[boardId] = [];
      categoriesByBoardId[boardId].push(c.name as string);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      <Link
        href="/community"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors mb-8"
      >
        <ChevronLeft size={16} />
        커뮤니티
      </Link>

      <div className="mb-12">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Column Member</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">컬럼회원 안내</h1>
        <p className="text-muted-foreground leading-relaxed">
          컬럼 · 연재 · 정보 · 광고 게시판은 컬럼회원만 글을 쓸 수 있는 공간입니다. 가입 방법부터
          글쓰기, 뉴스레터 반영 방식까지 안내해 드립니다.
        </p>
      </div>

      {/* 가입 방법 */}
      <section className="mb-14">
        <h2 className="text-xl font-bold text-foreground mb-4">컬럼회원 가입 방법</h2>
        <div className="rounded-xl border border-border bg-white p-6 space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            컬럼회원은 모즈나인 홈페이지 구독 서비스를 이용 중인 계약 고객에게 부여되는 자격입니다.
            일반 회원가입만으로는 자동으로 부여되지 않으며, 아래 순서로 진행됩니다.
          </p>
          <ol className="space-y-3 text-sm text-foreground">
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                1
              </span>
              <span>
                <Link href="/register" className="text-primary hover:underline font-medium">
                  회원가입
                </Link>
                을 진행합니다.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                2
              </span>
              <span>
                <Link href="/contact" className="text-primary hover:underline font-medium">
                  무료상담 · 견적문의
                </Link>
                를 통해 모즈나인 서비스 계약을 진행합니다.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                3
              </span>
              <span>계약이 확인되면 운영자가 컬럼회원 권한을 부여해 드립니다. 이후 로그인 상태에서 컬럼 · 연재 · 정보 · 광고 게시판에 바로 글을 쓸 수 있습니다.</span>
            </li>
          </ol>
          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            이미 계약 중인데 컬럼회원 권한이 없다면 무료상담 · 견적문의 페이지로 문의해 주세요.
          </p>
        </div>
      </section>

      {/* 게시판 소개 */}
      <section className="mb-14">
        <h2 className="text-xl font-bold text-foreground mb-4">게시판 소개 및 카테고리</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {BOARD_ORDER.map((slug) => {
            const intro = BOARD_INTROS[slug];
            const board = boardsBySlug.get(slug);
            const categories = board ? (categoriesByBoardId[board.id] ?? []) : [];

            return (
              <div key={slug} className="rounded-xl border border-border bg-white p-5">
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{intro.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">{intro.description}</p>
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((name) => (
                      <Badge key={name} variant="outline">
                        {name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 글쓰기 / 수정 / 삭제 */}
      <section className="mb-14">
        <h2 className="text-xl font-bold text-foreground mb-4">글 등록 · 수정 · 삭제</h2>
        <div className="rounded-xl border border-border bg-white divide-y divide-border">
          <div className="flex gap-4 p-5">
            <PenLine size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">등록하기</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                로그인 후 원하는 게시판(컬럼 · 연재 · 정보 · 광고)에서 &ldquo;글쓰기&rdquo; 버튼을 누르고
                카테고리를 선택한 뒤 제목과 내용을 작성해 등록합니다.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-5">
            <Pencil size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">수정하기</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                본인이 작성한 글 상세 페이지에서 연필 아이콘을 눌러 수정할 수 있습니다. 다른 회원의
                글은 수정할 수 없습니다.
              </p>
            </div>
          </div>
          <div className="flex gap-4 p-5">
            <Trash2 size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">삭제하기</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                본인이 작성한 글은 삭제 아이콘으로 직접 삭제할 수 있습니다. 삭제된 글은 복구되지
                않으니 신중하게 진행해 주세요.
              </p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-xs text-muted-foreground">
              작성한 글은{" "}
              <Link href="/mypage/column" className="text-primary hover:underline">
                마이페이지 &gt; 컬럼 게시판
              </Link>
              에서 모아볼 수 있습니다.
            </p>
          </div>
        </div>
      </section>

      {/* 뉴스레터 반영 */}
      <section>
        <h2 className="text-xl font-bold text-foreground mb-4">뉴스레터에 어떻게 반영되나요?</h2>
        <div className="rounded-xl border border-border bg-white p-6 space-y-5">
          <div className="flex gap-4">
            <Mail size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              운영자가 뉴스레터를 만들 때 컬럼 · 연재 · 정보 · 광고 게시판에 등록된 글 중 일부를 골라
              뉴스레터 본문에 그대로 담습니다. 모든 글이 자동으로 발송되는 것은 아니며, 운영자가 매
              발행 시 선별합니다.
            </p>
          </div>
          <div className="flex gap-4">
            <UserRound size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              내 글이 뉴스레터에 실리면 본문 위에 내 프로필 사진(등록하지 않았다면 기본 아이콘)과
              닉네임이 함께 표시되어 작성자로 소개됩니다. 프로필 사진은{" "}
              <Link href="/mypage/profile" className="text-primary hover:underline">
                마이페이지 &gt; 회원정보 수정
              </Link>
              에서 등록할 수 있습니다.
            </p>
          </div>
          <div className="flex gap-4">
            <ThumbsUp size={18} className="text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground leading-relaxed">
              뉴스레터가 실제로 발송되거나 웹에 발행되면 원문 게시글의 사용 기록이 남습니다. 이미
              발송된 뉴스레터는 &ldquo;
              <Link href="/newsletter" className="text-primary hover:underline">
                이전뉴스 보기
              </Link>
              &rdquo;에서 확인할 수 있고, 독자들이 하단의 좋아요 · 아쉬워요 버튼으로 반응을 남길 수
              있습니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
