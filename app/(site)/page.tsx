import Link from "next/link";
import { ArrowRight, BookOpen, Globe, TrendingUp } from "lucide-react";

const featuredWorks = [
  {
    title: "작가 개인 브랜딩 사이트",
    category: "홈페이지 제작",
    description: "베스트셀러 작가의 개인 브랜딩과 강연 문의를 위한 사이트",
    tags: ["Next.js", "Tailwind CSS"],
  },
  {
    title: "전문직 1인 사업가 포트폴리오",
    category: "포트폴리오",
    description: "세무사의 전문성을 강조한 신뢰감 있는 포트폴리오 사이트",
    tags: ["SEO", "반응형"],
  },
  {
    title: "온라인 강의 랜딩 페이지",
    category: "랜딩 페이지",
    description: "전환율 최적화를 위한 온라인 강의 홍보 랜딩 페이지",
    tags: ["전환율 최적화", "CTA"],
  },
];

const services = [
  {
    icon: Globe,
    title: "홈페이지 제작",
    desc: "작가와 전문직을 위한 신뢰감 있는 개인 브랜딩 사이트",
  },
  {
    icon: BookOpen,
    title: "콘텐츠 전략",
    desc: "책과 전문 지식을 디지털 콘텐츠로 확장하는 전략",
  },
  {
    icon: TrendingUp,
    title: "디지털 운영",
    desc: "SNS, 뉴스레터, 블로그 등 디지털 채널 통합 운영",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-white py-20 sm:py-28 lg:py-36">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-amber-50" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm font-medium text-accent mb-4 tracking-widest uppercase">
            Digital Partner for Creators
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight tracking-tight">
            작가의 꿈을
            <br />
            <span className="text-primary">디지털 세계</span>에 구현합니다
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            25년차 개발자이자 작가인 홍성호입니다.
            <br />책 쓴 사람, 전문직, 1인 사업가가 온라인에서 빛날 수 있도록 돕습니다.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/works"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-white hover:bg-primary/90 transition-colors"
            >
              작업 보기
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
            >
              무료 상담 신청
            </Link>
          </div>
        </div>
      </section>

      {/* Services snippet */}
      <section className="py-16 bg-muted/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {services.map((s) => (
              <div key={s.title} className="flex flex-col items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <s.icon size={22} className="text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured works */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-sm font-medium text-accent uppercase tracking-widest mb-2">
                Portfolio
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">대표 제작 사례</h2>
            </div>
            <Link
              href="/works"
              className="hidden sm:inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              전체 보기 <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredWorks.map((work) => (
              <div
                key={work.title}
                className="rounded-xl border border-border bg-white p-6 hover:shadow-md transition-shadow"
              >
                <div className="h-40 rounded-lg bg-gradient-to-br from-blue-100 to-blue-50 mb-4 flex items-center justify-center">
                  <Globe size={36} className="text-primary/40" />
                </div>
                <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">
                  {work.category}
                </p>
                <h3 className="font-semibold text-foreground mb-2">{work.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {work.description}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {work.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-1 rounded-md bg-muted text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center sm:hidden">
            <Link
              href="/works"
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              전체 보기 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* About snippet */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-accent uppercase tracking-widest mb-2">
              About
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-4">
              홍성호를 소개합니다
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              25년간 개발자로 일하며 책을 쓰고, 강의하고, 1인 사업을 운영했습니다.
              기술과 글쓰기를 모두 아는 사람이 만들어야 진짜 작가를 위한 디지털 공간이 탄생한다고
              믿습니다. 모즈나인은 그 믿음으로 만들어졌습니다.
            </p>
            <Link
              href="/about"
              className="mt-6 inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              더 알아보기 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 bg-primary">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            지금 바로 무료 상담을 신청하세요
          </h2>
          <p className="text-blue-200 mb-8 text-base">
            포트폴리오 확인 후 궁금한 점이 있다면 편하게 연락 주세요.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-8 py-3 text-base font-medium text-white hover:bg-accent/90 transition-colors"
          >
            무료 상담 신청하기
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
