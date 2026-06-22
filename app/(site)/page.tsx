import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Globe, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getOgImage } from "@/lib/og-image";

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
      <section className="relative overflow-hidden bg-white py-16 sm:py-24 lg:py-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-50 via-white to-amber-50" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Text */}
            <div>
              <p className="text-sm font-medium text-accent mb-4 tracking-widest">
                &#x270D;&#xFE0F; 작가가 만드는, 작가를 위한 홈페이지
              </p>
              <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight tracking-tight">
                쓰는 데 집중하세요.
                <br />
                나머지는 <span className="text-primary">모즈나인</span>이 합니다.
              </h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
                홈페이지 운영 · 콘텐츠 관리 · 뉴스레터까지
                <br />
                창작자를 위한 디지털 파트너십
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-white hover:bg-primary/90 transition-colors"
                >
                  무료 상담 신청
                  <ArrowRight size={16} />
                </Link>
                <Link
                  href="/goods"
                  className="inline-flex items-center justify-center rounded-md border border-border px-6 py-3 text-base font-medium text-foreground hover:bg-muted transition-colors"
                >
                  상품 둘러보기
                </Link>
              </div>
            </div>

            {/* Image */}
            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-xl">
                <Image
                  src="/images/hero-writer.webp"
                  alt="모즈나인 홈페이지를 보며 글을 쓰는 작가"
                  width={640}
                  height={512}
                  priority
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing snippet */}
      <section className="py-16 sm:py-20 bg-muted/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Pricing</p>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
              단계에 맞는 플랜을 선택하세요
            </h2>
            <p className="text-muted-foreground">
              구축부터 월 운영까지, 모즈나인이 함께합니다.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {/* BASIC */}
            <div className="rounded-xl border border-border bg-white p-6 flex flex-col">
              <h3 className="text-lg font-bold text-foreground mb-1">BASIC</h3>
              <p className="text-sm text-muted-foreground mb-4">가볍게 시작하는 작가</p>
              <p className="text-2xl font-bold text-foreground mb-1">
                월 70,000<span className="text-sm font-normal text-muted-foreground">원</span>
              </p>
              <p className="text-xs text-muted-foreground mb-5">셋업비 100,000원 (1회)</p>
              <ul className="space-y-2 flex-1 mb-6">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  템플릿 3종 · 페이지 5개
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  월 2회 수정 · 호스팅 포함
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  14일 무료 체험
                </li>
              </ul>
              <Link
                href="/goods"
                className="inline-flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                자세히 보기 <ArrowRight size={14} />
              </Link>
            </div>

            {/* STANDARD */}
            <div className="relative rounded-xl border-2 border-primary bg-white p-6 flex flex-col shadow-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary text-white px-3 py-1 rounded-full">
                  <Star size={11} fill="currentColor" /> 추천
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">STANDARD</h3>
              <p className="text-sm text-muted-foreground mb-4">콘텐츠 사업을 시작하는 작가</p>
              <p className="text-2xl font-bold text-foreground mb-1">
                월 150,000<span className="text-sm font-normal text-muted-foreground">원</span>
              </p>
              <p className="text-xs text-muted-foreground mb-5">셋업비 500,000원 (1회)</p>
              <ul className="space-y-2 flex-1 mb-6">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  커스텀 디자인 · 페이지 10개
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  월 5회 수정 · 도메인 연결
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  결제 연동 · 뉴스레터 월 1회
                </li>
              </ul>
              <Link
                href="/goods"
                className="inline-flex items-center justify-center gap-1.5 w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
              >
                자세히 보기 <ArrowRight size={14} />
              </Link>
            </div>

            {/* PREMIUM */}
            <div className="rounded-xl border border-border bg-white p-6 flex flex-col">
              <h3 className="text-lg font-bold text-foreground mb-1">PREMIUM</h3>
              <p className="text-sm text-muted-foreground mb-4">브랜드를 키우는 작가·인플루언서</p>
              <p className="text-2xl font-bold text-foreground mb-1">
                월 350,000<span className="text-sm font-normal text-muted-foreground">원</span>
              </p>
              <p className="text-xs text-muted-foreground mb-5">셋업비 1,500,000원 (1회)</p>
              <ul className="space-y-2 flex-1 mb-6">
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  풀 커스텀 · 페이지 무제한
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  멤버십·구독 결제 · 도메인 2개
                </li>
                <li className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                  PWA 웹앱 · 매출 리포트
                </li>
              </ul>
              <Link
                href="/goods"
                className="inline-flex items-center justify-center gap-1.5 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                자세히 보기 <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/goods"
              className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
            >
              전체 상품 소개 보기 <ArrowRight size={14} />
            </Link>
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
      <section className="py-16 sm:py-20 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Text */}
            <div>
              <p className="text-sm font-medium text-accent uppercase tracking-widest mb-2">
                About
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-6">
                모즈나인을 운영하는 사람
              </h2>
              <ul className="space-y-2.5 text-muted-foreground leading-relaxed mb-6">
                <li>&#x1F58B;&#xFE0F; 베스트셀러 &lsquo;루틴의 설계&rsquo; 저자</li>
                <li>&#x1F4BB; 25년차 웹 개발자, 모즈나인 IT 대표</li>
                <li>&#x1F4DA; 전자책 11권 출간, 종이책 1권 출간</li>
                <li>&#x1F504; 100일 챌린지 &lsquo;검백챌&rsquo; 운영자</li>
                <li>&#x1F393; 전자책·종이책 출간 코칭 진행</li>
              </ul>
              <blockquote className="border-l-4 border-primary pl-4 text-foreground italic leading-relaxed mb-6">
                &ldquo;창작자가 글쓰기와 콘텐츠 제작에만
                <br />
                온전히 집중할 수 있는 환경을 만드는 것.
                <br />
                그것이 모즈나인의 미션입니다.&rdquo;
              </blockquote>
              <Link
                href="/about"
                className="inline-flex items-center gap-1 text-sm text-primary font-medium hover:underline"
              >
                더 알아보기 <ArrowRight size={14} />
              </Link>
            </div>

            {/* Illustration */}
            <div className="flex items-center justify-center">
              <Image
                src="/images/about-illustration.webp"
                alt="책과 노트북을 연결하는 모즈나인 일러스트"
                width={640}
                height={360}
                className="w-full h-auto"
              />
            </div>
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
