import Link from "next/link";
import { ArrowRight, BookOpen, Globe, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOgImage } from "@/lib/og-image";

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

export default async function HomePage() {
  const supabase = await createClient();
  const { data: portfolios } = await supabase
    .from("portfolio_items")
    .select("id, title, category, description, link, thumbnail_url")
    .eq("status", "공개")
    .order("created_at", { ascending: false })
    .limit(3);

  const featuredWorks = await Promise.all(
    (portfolios ?? []).map(async (p) => {
      let imageUrl: string | null = p.thumbnail_url ?? null;
      if (!imageUrl && p.link) {
        imageUrl = await getOgImage(p.link);
      }
      return { ...p, imageUrl };
    })
  );
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
            {featuredWorks.map((work) => {
              const Wrapper = work.link
                ? ({ children }: { children: React.ReactNode }) => (
                    <a
                      href={work.link!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md transition-shadow group block"
                    >
                      {children}
                    </a>
                  )
                : ({ children }: { children: React.ReactNode }) => (
                    <div className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md transition-shadow group">
                      {children}
                    </div>
                  );

              return (
                <Wrapper key={work.id}>
                  <div className="h-40 overflow-hidden bg-gradient-to-br from-blue-100 to-blue-50">
                    {work.imageUrl ? (
                      <img
                        src={work.imageUrl}
                        alt={work.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Globe size={36} className="text-primary/20" />
                      </div>
                    )}
                  </div>
                  <div className="p-5">
                    <p className="text-xs font-medium text-accent uppercase tracking-wider mb-1">
                      {work.category}
                    </p>
                    <h3 className="font-semibold text-foreground mb-2">{work.title}</h3>
                    {work.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
                        {work.description}
                      </p>
                    )}
                  </div>
                </Wrapper>
              );
            })}
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
              모즈나인을 소개합니다
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
