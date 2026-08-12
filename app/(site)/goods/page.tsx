import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Globe, Mail, Star } from "lucide-react";

export const metadata: Metadata = {
  title: "상품소개 | 모즈나인",
  description: "작가·1인 크리에이터를 위한 디지털 운영 파트너십 패키지 안내",
};

interface Plan {
  id: string;
  name: string;
  tagline: string;
  monthly: string;
  vat: "포함" | "별도";
  annualMonthly?: string;
  setup?: string;
  billingNote?: string;
  totalNote?: string;
  notes?: string[];
  popular: boolean;
  cta: { label: string; href: string };
  features: string[];
  targets: string[];
}

const plans: Plan[] = [
  {
    id: "light",
    name: "LIGHT",
    tagline: "원고만 주시면 맞춤 랜딩페이지 완성",
    monthly: "10,000",
    vat: "포함",
    billingNote: "1년 선납 120,000원 + 최초 셋업비 100,000원",
    totalNote: "총 220,000원으로 1년 간 운영 걱정 끝!",
    popular: true,
    cta: { label: "LIGHT 시작하기", href: "/contact" },
    features: [
      "원페이지 랜딩페이지형 홈페이지 전용",
      "상담포함 단 3일 속성 완공",
      "분기별 1회(연 4회) 간단 수정",
      "모즈나인 무료 도메인 기본제공",
      "호스팅 포함",
    ],
    notes: [
      "* 기존도메인 연결 시 별도 수수료",
      "★ BASIC/STANDARD 업그레이드 지원",
    ],
    targets: [
      "랜딩페이지 1개만 빠르게 필요한 분",
      "원고는 준비됐고 제작 시간이 없는 분",
      "1년 예산을 한 번에 정리하고 싶은 분",
    ],
  },
  {
    id: "basic",
    name: "BASIC",
    tagline: "시작하는 작가를 위한 가장 가벼운 시작",
    monthly: "70,000",
    vat: "별도",
    annualMonthly: "60,000",
    setup: "100,000",
    popular: false,
    cta: { label: "BASIC 시작하기", href: "/contact" },
    features: [
      "커스텀 디자인(PC/모바일)",
      "페이지 5개까지",
      "월 2회 수정 (텍스트·이미지)",
      "호스팅 포함",
      "모즈나인 서브도메인 무료 제공",
      "14일 무료 체험 가능",
    ],
    notes: [
      "* 기존도메인 연결 시 별도 수수료",
      "★ STANDARD 업그레이드 지원",
    ],
    targets: [
      "책 소개 페이지가 필요한 신인 작가",
      "인스타 링크인바이오를 대체하고 싶은 분",
      "가볍게 시작하고 싶은 분",
    ],
  },
  {
    id: "standard",
    name: "STANDARD",
    tagline: "본격적으로 콘텐츠 사업을 시작하는 작가를 위해",
    monthly: "150,000",
    vat: "별도",
    annualMonthly: "130,000",
    setup: "500,000",
    popular: false,
    cta: { label: "STANDARD 시작하기", href: "/contact" },
    features: [
      "커스텀 디자인(PC/모바일)",
      "페이지 20개까지",
      "월 5회 수정 (각 1시간 이내)",
      "개인 도메인 연결 포함 (1개)",
      "기본 회원 관리 (DB·CSV 추출)",
      "결제 연동 가능 (PG 셋업 별도)",
      "영업일 24시간 내 응답",
    ],
    targets: [
      "전자책·강의를 판매하는 작가",
      "1:1 코칭 사업을 운영하는 분",
      "100일 챌린지 같은 콘텐츠를 운영하는 분",
    ],
  },
  {
    id: "premium",
    name: "PREMIUM",
    tagline: "브랜드를 키우는 작가·인플루언서를 위한 풀 서비스",
    monthly: "350,000",
    vat: "별도",
    annualMonthly: "300,000",
    setup: "1,500,000",
    popular: false,
    cta: { label: "PREMIUM 문의하기", href: "/contact" },
    features: [
      "커스텀 디자인(PC/모바일)",
      "페이지 제한 없음",
      "월 10회 수정",
      "개인 도메인 연결 포함 (2개)",
      "등급제 회원 관리 + 자동화 메일",
      "정기결제·일회성 결제 모두 지원",
      "영업일 24시간 내 응답",
      "월 구독 멤버십 운영 가능",
      "매출 리포트 월 1회 제공",
    ],
    targets: [
      "월 매출 500만원 이상 인플루언서",
      "멤버십·구독 사업을 운영하는 분",
      "브랜드를 본격 확장하는 작가",
    ],
  },
];

export default function GoodsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Services</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">상품 소개</h1>
        <p className="text-muted-foreground leading-relaxed">
          작가와 1인 사업가에게 꼭 맞는 디지털 운영 파트너십입니다.
          <br />단계에 맞는 플랜을 선택하세요.
        </p>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative rounded-2xl border-2 bg-white flex flex-col ${
              plan.popular ? "border-primary shadow-lg" : "border-border"
            }`}
          >
            {plan.popular && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-primary text-white px-3 py-1 rounded-full">
                  <Star size={11} fill="currentColor" /> 추천
                </span>
              </div>
            )}

            {/* Plan header */}
            <div className={`px-6 pt-8 pb-6 text-center border-b ${plan.popular ? "border-primary/20" : "border-border"}`}>
              <h3 className="text-xl font-bold text-foreground mb-2">{plan.name}</h3>
              <p className="text-sm text-muted-foreground mb-6">{plan.tagline}</p>

              <div className="mb-1.5">
                <span className={`text-3xl font-bold ${plan.popular ? "text-primary" : "text-foreground"}`}>
                  {plan.monthly}
                </span>
                <span className="text-sm text-muted-foreground">원/월</span>
              </div>
              <p className="text-[11px] font-medium text-muted-foreground/80 mb-2">
                VAT {plan.vat}
              </p>

              {plan.billingNote ? (
                <>
                  <p className="text-xs text-muted-foreground">{plan.billingNote}</p>
                  <p className="text-xs font-semibold text-primary mt-1">{plan.totalNote}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    연납 시 월 {plan.annualMonthly}원
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    셋업비 {plan.setup}원 (1회)
                  </p>
                </>
              )}
            </div>

            {/* Features */}
            <div className="px-6 pt-6 pb-2 flex-1">
              <ul className="space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-foreground">
                    <Check size={16} className="text-primary flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>

              {plan.notes && (
                <div className="mt-4 space-y-1">
                  {plan.notes.map((n) => (
                    <p key={n} className="text-[11px] text-muted-foreground/70">
                      {n}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Targets */}
            <div className="px-6 pb-6">
              <div className="rounded-lg bg-muted/50 p-4 mb-5">
                <p className="text-xs font-semibold text-foreground mb-2.5">
                  &#x1F4A1; 이런 분께 추천
                </p>
                <ul className="space-y-1.5">
                  {plan.targets.map((t) => (
                    <li key={t} className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <span className="text-muted-foreground/60 mt-px">·</span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={plan.cta.href}
                className={`inline-flex items-center justify-center gap-2 w-full rounded-md px-4 py-3 text-sm font-medium transition-colors ${
                  plan.popular
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-border text-foreground hover:bg-muted"
                }`}
              >
                {plan.cta.label}
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Process */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">
            4단계로 시작하는 모즈나인
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="relative rounded-xl border border-border bg-white p-6">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-lg mb-4">
              1
            </span>
            <h3 className="font-semibold text-foreground mb-2">무료 상담 (30분)</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              원하는 방향과 필요한 기능을 자유롭게 이야기해요.
              현실적인 추천 플랜을 알려드립니다.
            </p>
          </div>

          <div className="relative rounded-xl border border-border bg-white p-6">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-lg mb-4">
              2
            </span>
            <h3 className="font-semibold text-foreground mb-2">셋업 (3~7일)</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              선택하신 플랜에 맞춰 홈페이지를 세팅합니다.
              템플릿 선택부터 도메인 연결까지.
            </p>
          </div>

          <div className="relative rounded-xl border border-border bg-white p-6">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-lg mb-4">
              3
            </span>
            <h3 className="font-semibold text-foreground mb-2">검수 &amp; 오픈</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              원하는 디자인과 기능을 확인한 후 오픈합니다.
              교육 자료와 매뉴얼을 함께 드립니다.
            </p>
          </div>

          <div className="relative rounded-xl border border-border bg-white p-6">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-lg mb-4">
              4
            </span>
            <h3 className="font-semibold text-foreground mb-2">매달 함께 운영</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              콘텐츠 업로드, 수정, 뉴스레터 발송까지
              모즈나인이 매달 곁에서 함께합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Add-on services */}
      <div className="mb-20">
        <div className="text-center mb-12">
          <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Add-on</p>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-3">부가 서비스</h2>
          <p className="text-muted-foreground text-sm">
            플랜 요금에 포함되지 않는 추가 서비스는 아래 조건으로 별도 진행됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Domain */}
          <div className="rounded-xl border border-border bg-white p-6 sm:p-8 flex flex-col">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-4">
              <Globe size={18} />
            </span>
            <h3 className="font-semibold text-foreground mb-2">1. 도메인 구매 및 관리</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-1">
              별도 진행 · 도메인 가격에 따라 비용이 결정됩니다. (VAT 별도)
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              원하는 도메인의 구매 가능 여부와 가격은 후이즈(WHOIS) 같은 도메인 등록 대행업체
              사이트에서 직접 확인할 수 있어요. 도메인 검색창에 원하는 주소를 입력하면 등록
              가능 여부와 연간 비용이 바로 표시되며, 해당 화면을 캡처해 상담 시 함께 보내주시면
              가장 빠르게 안내해 드립니다.
            </p>
            <a
              href="https://domain.whois.co.kr/regist/dom.php"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              후이즈에서 도메인 확인하기 <ExternalLink size={14} />
            </a>
          </div>

          {/* Newsletter */}
          <div className="rounded-xl border border-border bg-white p-6 sm:p-8 flex flex-col">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary mb-4">
              <Mail size={18} />
            </span>
            <h3 className="font-semibold text-foreground mb-2">2. 뉴스레터 개발 및 세팅</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-1">
              비용 협의 · 요구사항에 따라 견적이 달라집니다. (VAT 별도)
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              모즈나인 뉴스레터를 통해 광고도 가능합니다. 원하시는 방향을 말씀해 주시면 규모와
              기능에 맞는 견적을 안내해 드립니다.
            </p>
            <Link
              href="/contact"
              className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              무료상담을 이용하세요 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl bg-primary px-8 py-10 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">어떤 플랜이 맞을지 모르겠다면?</h2>
        <p className="text-blue-200 mb-6 text-sm">
          무료 상담을 통해 현재 상황에 맞는 플랜을 추천해 드립니다.
        </p>
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-md bg-accent px-8 py-3 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          무료 상담 신청하기 <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
