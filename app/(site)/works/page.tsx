import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";

export const metadata: Metadata = {
  title: "제작사례 | 모즈나인",
  description: "모즈나인이 제작한 홈페이지 및 디지털 콘텐츠 포트폴리오",
};

const works = [
  {
    title: "작가 개인 브랜딩 사이트",
    category: "홈페이지 제작",
    description:
      "베스트셀러 작가의 개인 브랜딩과 강연 문의를 위한 사이트. 심플하고 신뢰감 있는 디자인으로 방문자를 강연 문의로 연결합니다.",
    tags: ["Next.js", "Tailwind CSS", "SEO"],
    link: null,
  },
  {
    title: "세무사 포트폴리오 사이트",
    category: "포트폴리오",
    description:
      "세무사의 전문성을 강조한 신뢰감 있는 포트폴리오 사이트. 고객 후기와 서비스 소개를 중심으로 구성하였습니다.",
    tags: ["SEO", "반응형", "Google Analytics"],
    link: null,
  },
  {
    title: "온라인 강의 랜딩 페이지",
    category: "랜딩 페이지",
    description:
      "전환율 최적화를 위한 온라인 강의 홍보 랜딩 페이지. CTA 버튼 클릭률 42% 달성.",
    tags: ["전환율 최적화", "CTA", "A/B 테스트"],
    link: null,
  },
  {
    title: "1인 코치 개인 브랜딩",
    category: "홈페이지 제작",
    description:
      "커리어 코치의 개인 브랜딩 사이트. 코칭 프로그램 소개와 후기를 중심으로 구성하였습니다.",
    tags: ["Next.js", "반응형", "SEO"],
    link: null,
  },
  {
    title: "출판사 작가 소개 페이지",
    category: "콘텐츠 제작",
    description:
      "출판사의 소속 작가 3인을 소개하는 미니 사이트. 각 작가의 책과 강연 일정을 안내합니다.",
    tags: ["콘텐츠 전략", "디자인"],
    link: null,
  },
];

const categories = ["전체", "홈페이지 제작", "랜딩 페이지", "포트폴리오", "콘텐츠 제작"];

export default function WorksPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="max-w-2xl mb-12">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Works</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">제작 사례</h1>
        <p className="text-muted-foreground leading-relaxed">
          작가, 전문직, 1인 사업가를 위해 제작한 디지털 작업물입니다.
        </p>
      </div>

      {/* Category filter (static display - can be made interactive) */}
      <div className="flex flex-wrap gap-2 mb-10">
        {categories.map((cat, i) => (
          <span
            key={cat}
            className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
              i === 0
                ? "bg-primary text-white border-primary"
                : "border-border text-muted-foreground hover:border-primary hover:text-primary"
            }`}
          >
            {cat}
          </span>
        ))}
      </div>

      {/* Works grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {works.map((work) => (
          <div
            key={work.title}
            className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md transition-shadow group"
          >
            {/* Thumbnail placeholder */}
            <div className="h-48 bg-gradient-to-br from-blue-100 via-blue-50 to-amber-50 flex items-center justify-center">
              <span className="text-primary/30 text-4xl font-bold">M9</span>
            </div>

            <div className="p-5">
              <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">
                {work.category}
              </p>
              <h3 className="font-semibold text-foreground mb-2">{work.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">{work.description}</p>

              <div className="flex flex-wrap gap-2 mb-4">
                {work.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {work.link && (
                <a
                  href={work.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
                >
                  사이트 보기 <ExternalLink size={13} />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
