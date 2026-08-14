import type { Metadata } from "next";
import { ArrowRight, BookOpen, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "회사소개 | 모즈나인",
  description: "25년차 개발자이자 작가 홍성호의 경력과 모즈나인의 이야기",
};

type CareerEntry = {
  period: string;
  role: string;
  bullets: string[];
};

const career: CareerEntry[] = [
  {
    period: "2000 – 2010",
    role: "소프트웨어 개발자 · 초기 커리어",
    bullets: [
      "Java/JSP 기반 기업용 웹 시스템 개발 시작",
      "ERP, 그룹웨어, 인트라넷 시스템 구축 참여",
      "공공기관·금융권 SI 프로젝트 다수 수행",
      "웹 표준·Ajax 기반 UI/UX 개발 역량 확보",
      "팀 리드로서 소규모 프로젝트 관리 경험",
    ],
  },
  {
    period: "2010 – 2020",
    role: "웹/앱 프로젝트 리더",
    bullets: [
      "스마트폰 보급에 맞춘 모바일 웹·앱 개발 전환",
      "React·Vue.js 등 SPA 프레임워크 도입 주도",
      "스타트업 CTO 역할 수행 및 MVP 출시 경험",
      "프리랜서 독립 후 중소기업 디지털 전환 지원 다수",
      "쇼핑몰, 예약 시스템, 커뮤니티 플랫폼 등 다양한 도메인 경험",
    ],
  },
  {
    period: "2024 –",
    role: "작가 · 크리에이터",
    bullets: [
      "자기계발·에세이 분야 전자책 12권 출간",
      "전자책 코칭으로 70명 이상의 베스트셀러 작가 배출",
      "종이책 《루틴의 설계》 출간 (모모북스, 2025.08)",
      "모즈나인 설립 — 작가·1인 크리에이터 디지털 운영 파트너",
    ],
  },
];

const books = {
  paperback: [
    {
      title: "루틴의 설계",
      publisher: "모모북스",
      date: "2025.08",
      genre: "자기계발",
      link: "https://product.kyobobook.co.kr/detail/S000217241447",
    },
  ],
  ebook: [
    {
      title: "3달만에 0에서 5천 인플루언서 블로거가 되는 법",
      date: "2024.03",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/125234464",
    },
    {
      title: "평범한 블로거를 3달 만에 베스트셀러작가로 만든 비결",
      date: "2024.03",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/125713878",
    },
    {
      title: "B형 남자",
      date: "2024.05",
      genre: "에세이",
      link: "https://www.yes24.com/Product/Goods/126468407",
    },
    {
      title: "극복하지 못해도 괜찮아",
      date: "2024.07",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/128739566",
    },
    {
      title: "50대에 시작하는 SNS",
      date: "2024.09",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/133869955",
    },
    {
      title: "블로그 1년, 두근거리는 인생 2막의 시작",
      date: "2024.12",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/140244236",
    },
    {
      title: "글쓰기 초보를 위한 SNS 글감 찾기",
      date: "2025.02",
      genre: "자기계발",
      link: "https://www.yes24.com/Product/Goods/142703098",
    },
    {
      title: "한 번뿐인 인생을 깨우는 5가지 키워드",
      date: "2025.09",
      genre: "자기계발",
      link: "https://www.yes24.com/product/goods/155075285",
    },
    {
      title: "꾸준함 관리 비법",
      date: "2025.12",
      genre: "자기계발",
      link: "https://www.yes24.com/product/goods/167782427",
    },
    {
      title: "코드를 짜던 사람이 삶을 기록하기 시작했다",
      date: "2026.01",
      genre: "에세이",
      link: "https://www.yes24.com/product/goods/155075285",
    },
    {
      title: "오십, 내 인생은 아직 끝나지 않았다",
      date: "2026.05",
      genre: "자기계발",
      link: "https://www.yes24.com/product/goods/177256726",
    },
    {
      title: "매일 한 줄이 인생을 바꾼다",
      date: "2026.08",
      genre: "자기계발",
      link: "https://www.yes24.com/product/goods/194645680",
    },
  ],
};

const skills = [
  "Next.js / React",
  "TypeScript",
  "Tailwind CSS",
  "SEO 최적화",
  "콘텐츠 전략",
  "디지털 브랜딩",
  "책 출간 기획",
  "온라인 강의 제작",
];

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="max-w-2xl mb-16">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">About</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-6">
          작가의 디지털 파트너,
          <br />모즈나인
        </h1>
        <p className="text-muted-foreground leading-relaxed text-base">
          25년간 개발자로 일하며 책을 쓰고, 강의하고, 1인 사업을 운영했습니다.
          기술과 글쓰기 모두를 아는 사람이 만들어야 진짜 작가를 위한 디지털 공간이 탄생한다고
          믿습니다. 모즈나인은 그 믿음으로 만들어졌습니다.
        </p>
      </div>

      {/* Company intro */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-foreground mb-6">사업 소개</h2>
        <div className="max-w-3xl space-y-4 text-muted-foreground leading-relaxed text-base">
          <p>
            MOZNINE은 디지털 기술을 통해 기업의 가능성을 현실로 만드는 IT 개발 전문 기업입니다.
          </p>
          <p>
            홈페이지와 웹 서비스, 모바일 애플리케이션의 개발부터 유지보수, 운영까지 하나의
            서비스가 지속적으로 성장할 수 있도록 전 과정을 함께합니다.
          </p>
          <p>
            우리는 단순히 프로그램을 만드는 것이 아니라, 고객의 비즈니스에 가장 적합한 디지털
            환경을 설계하고 안정적으로 운영하는 것을 목표로 합니다.
          </p>
          <p>
            MOZNINE은 작은 아이디어도 더 큰 가치로 연결될 수 있다는 믿음 아래, 신뢰할 수 있는
            기술과 꾸준한 파트너십으로 고객과 함께 성장합니다.
          </p>
        </div>
      </div>

      {/* Logo story */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-foreground mb-6">로고에 담긴 의미</h2>
        <div className="rounded-xl border border-border bg-white p-8 sm:p-10">
          <Image
            src="/logo/moznine-logo-full.svg"
            alt="모즈나인 로고"
            width={240}
            height={120}
            className="h-[110px] w-auto mb-8"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-bold text-primary tracking-widest mb-2">MOZ</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                More than Zero
                <br />
                0에서 시작해 더 큰 가치를 만드는
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-accent tracking-widest mb-2">NINE</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                완성과 성장의 숫자
                <br />
                최고의 수준을 의미
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Career timeline */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-foreground mb-8">경력 타임라인</h2>
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-10">
            {career.map((item) => (
              <div key={item.period} className="flex gap-6 relative">
                <div className="w-6 h-6 rounded-full bg-primary flex-shrink-0 flex items-center justify-center z-10 mt-0.5">
                  <div className="w-2 h-2 rounded-full bg-white" />
                </div>
                <div className="pb-2">
                  <p className="text-xs font-medium text-accent mb-1">{item.period}</p>
                  <h3 className="font-semibold text-foreground mb-3">{item.role}</h3>
                  <ul className="space-y-1.5">
                    {item.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground flex-shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Books */}
      <div className="mb-16">
        <div className="flex items-center gap-2 mb-6">
          <BookOpen size={20} className="text-primary" />
          <h2 className="text-xl font-bold text-foreground">출간 작품</h2>
        </div>

        <div className="space-y-8">
          {/* Paperback */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">종이책</p>
            <div className="space-y-2">
              {books.paperback.map((b) => (
                <a
                  key={b.title}
                  href={b.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-4 rounded-lg border border-primary/20 bg-primary/5 hover:border-primary/40 transition-colors"
                >
                  <div>
                    <p className="font-medium text-foreground text-sm flex items-center gap-1.5">
                      《{b.title}》
                      <ExternalLink size={12} className="text-muted-foreground" />
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{b.publisher}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      {b.genre}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{b.date}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>

          {/* Ebook */}
          <div>
            <p className="text-sm font-semibold text-foreground mb-3">전자책 ({books.ebook.length}권)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {books.ebook.map((b, i) => (
                <a
                  key={b.title}
                  href={b.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start justify-between p-4 rounded-lg border border-border bg-white hover:border-primary/40 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted-foreground font-medium w-5 flex-shrink-0 mt-0.5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <p className="text-sm text-foreground leading-snug flex items-start gap-1.5">
                      《{b.title}》
                      <ExternalLink size={12} className="text-muted-foreground flex-shrink-0 mt-0.5" />
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-3">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {b.genre}
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">{b.date}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="mb-16">
        <h2 className="text-xl font-bold text-foreground mb-6">보유 역량</h2>
        <div className="flex flex-wrap gap-3">
          {skills.map((skill) => (
            <span
              key={skill}
              className="px-4 py-2 rounded-full border border-border text-sm text-foreground font-medium bg-white"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="pt-12 border-t border-border">
        <p className="text-muted-foreground mb-4">함께 일하고 싶으시다면 편하게 연락 주세요.</p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
        >
          무료 상담 신청하기 <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
