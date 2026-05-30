import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, X, Star } from "lucide-react";

export const metadata: Metadata = {
  title: "상품소개 | 모즈나인",
  description: "작가·1인 크리에이터를 위한 디지털 운영 파트너십 패키지 안내",
};

const packages = [
  {
    id: "basic",
    emoji: "🌱",
    name: "베이직",
    sub: "Starter",
    tagline: "내 사이트 가지기",
    target: "이제 막 시작하는 작가",
    setupFee: "300,000원",
    monthlyFee: "90,000원",
    annualTotal: "1,380,000원",
    contract: "12개월",
    popular: false,
    color: "border-border",
    accentColor: "bg-green-50 border-green-200",
    badgeColor: "bg-green-100 text-green-700",
    buildItems: [
      { label: "페이지 구성", value: "5페이지 이내" },
      { label: "디자인", value: "표준 템플릿 4종 선택" },
      { label: "도메인 연결", value: "✅ 지원 (도메인비 별도)" },
      { label: "SSL 보안", value: "✅ 자동 적용" },
      { label: "모바일 반응형", value: "✅ 기본 제공" },
      { label: "기본 SEO", value: "✅ 메타태그·사이트맵" },
      { label: "결제 시스템", value: "외부 링크 연결" },
      { label: "뉴스레터", value: "미포함" },
      { label: "구축 기간", value: "2주" },
    ],
    operItems: [
      { label: "콘텐츠 수정 요청", value: "월 2건" },
      { label: "신간 페이지 추가", value: "분기 1권 무료" },
      { label: "월간 트래픽 리포트", value: "✅ 간단 요약" },
      { label: "응답 시간", value: "영업일 48시간" },
      { label: "결제·뉴스레터·자동화", value: "미포함" },
    ],
    targets: [
      "책 1~2권 출간, 수익은 아직 미미한 작가",
      "내 도메인 사이트가 있다는 것 자체가 필요한 분",
      "결제는 외부 플랫폼(크몽·부크크)에서 받는 분",
      "월 10만 원 미만으로 시작하고 싶은 분",
    ],
  },
  {
    id: "standard",
    emoji: "🌿",
    name: "스탠다드",
    sub: "Pro",
    tagline: "팔리는 사이트 만들기",
    target: "책 1권 이상 낸 작가",
    setupFee: "800,000원",
    monthlyFee: "190,000원",
    annualTotal: "3,080,000원",
    contract: "12개월",
    popular: true,
    color: "border-primary",
    accentColor: "bg-primary border-primary",
    badgeColor: "bg-white/20 text-white",
    buildItems: [
      { label: "페이지 구성", value: "10페이지 이내" },
      { label: "디자인", value: "표준 템플릿 + 부분 커스터마이징" },
      { label: "결제 시스템", value: "✅ 토스페이먼츠·스트라이프 연동" },
      { label: "상품 페이지", value: "전자책·종이책·강의 등록" },
      { label: "전자책 자동 발송", value: "✅ 다운로드 링크 자동 발송" },
      { label: "뉴스레터 연동", value: "✅ 스티비 + 환영 메일" },
      { label: "기본 SEO + GA4", value: "✅" },
      { label: "카카오 채널 연결", value: "✅" },
      { label: "구축 기간", value: "3~4주" },
    ],
    operItems: [
      { label: "콘텐츠 수정 요청", value: "월 5건" },
      { label: "새 상품 등록", value: "월 2건 무료" },
      { label: "콘텐츠 발행 지원", value: "월 2회" },
      { label: "뉴스레터 발행 대행", value: "월 1회" },
      { label: "월간 리포트", value: "상세 분석" },
      { label: "응답 시간", value: "영업일 24시간" },
    ],
    targets: [
      "책 3권 이상 출간, 안정적 SNS 팔로워 보유",
      "내 사이트에서 직접 책·전자책·강의를 팔고 싶은 분",
      "뉴스레터로 독자와 직접 소통하고 싶은 분",
      "월 20만 원 정도면 본업에 집중할 수 있는 분",
    ],
  },
  {
    id: "premium",
    emoji: "🌳",
    name: "프리미엄",
    sub: "Master",
    tagline: "사업화 매니지드 서비스",
    target: "활발한 1인 사업가",
    setupFee: "1,500,000원",
    monthlyFee: "390,000원",
    annualTotal: "6,180,000원",
    contract: "12개월",
    popular: false,
    color: "border-border",
    accentColor: "bg-amber-50 border-amber-200",
    badgeColor: "bg-amber-100 text-amber-700",
    buildItems: [
      { label: "페이지 구성", value: "무제한" },
      { label: "디자인", value: "풀 커스터마이징" },
      { label: "멤버십·구독 시스템", value: "✅ 정기 결제 + 등급별 콘텐츠" },
      { label: "커뮤니티 기능", value: "✅ 회원 전용 게시판·DM" },
      { label: "자동화 시퀀스", value: "✅ 5단계 (가입→재구매)" },
      { label: "CRM 통합", value: "✅ 회원 등급·구매 이력 통합" },
      { label: "다국어 지원", value: "영문 페이지 옵션" },
      { label: "API 연동", value: "외부 도구 자유 연동" },
      { label: "구축 기간", value: "6주" },
    ],
    operItems: [
      { label: "콘텐츠 수정 요청", value: "무제한" },
      { label: "콘텐츠 발행 풀 매니지드", value: "월 4회" },
      { label: "소셜 미디어 자동화", value: "✅ 블로그→SNS 자동 분배" },
      { label: "멤버십 운영 지원", value: "✅ CS 대응 포함" },
      { label: "월 1:1 전략 미팅", value: "60분" },
      { label: "분기별 사이트 리뉴얼", value: "✅" },
      { label: "응답 시간", value: "영업일 4시간" },
      { label: "긴급 대응", value: "주말·야간 SMS 알림" },
    ],
    targets: [
      "월 매출 500만 원 이상 1인 사업가",
      "멤버십·구독 비즈니스를 본격 시작하려는 분",
      "콘텐츠 발행에 손이 부족한 분",
      "디지털 운영은 맡기고 본업에만 집중하고 싶은 분",
    ],
  },
];

const addonOnetime = [
  { name: "추가 페이지 (1p당)", price: "50,000원", desc: "5p 초과분" },
  { name: "디자인 풀 커스터마이징", price: "500,000원", desc: "맞춤형 디자인" },
  { name: "다국어 페이지 (영문)", price: "400,000원", desc: "영문 버전 추가" },
  { name: "모바일 앱 PWA 변환", price: "300,000원", desc: "앱처럼 설치 가능" },
  { name: "기존 사이트 이전", price: "200,000원~", desc: "데이터 양에 따라" },
  { name: "SEO 강화", price: "300,000원", desc: "키워드·구조·속도" },
  { name: "상품 일괄 등록 (10개 이상)", price: "200,000원", desc: "기존 상품 이전" },
  { name: "도메인·비즈니스 메일 셋업", price: "100,000원", desc: "비즈니스 메일 포함" },
];

const addonMonthly = [
  { name: "추가 수정 요청 (10건)", price: "100,000원/월", desc: "표준 한도 초과분" },
  { name: "뉴스레터 발행 대행 (월 4회)", price: "200,000원/월", desc: "주 1회 발송 대행" },
  { name: "SNS 콘텐츠 발행 대행 (주 3회)", price: "300,000원/월", desc: "인스타·스레드" },
  { name: "라이브 방송 페이지 운영", price: "150,000원/월", desc: "줌·유튜브 연동" },
  { name: "회원 CS 대응 대행", price: "200,000원/월", desc: "결제·환불·문의 응대" },
  { name: "주간 분석 리포트", price: "80,000원/월", desc: "주간 KPI 대시보드" },
  { name: "백업 보관 강화 (90일)", price: "50,000원/월", desc: "일별 백업 보관" },
  { name: "우선 대응 (응답시간 단축)", price: "100,000원/월", desc: "4h → 1h 응답" },
];

const addonProject = [
  { name: "책 런칭 캠페인 페이지", price: "400,000원", desc: "신간 출간 시" },
  { name: "강의 런칭 페이지", price: "500,000원", desc: "라이브 강의" },
  { name: "굿즈 판매 페이지", price: "300,000원", desc: "머그·다이어리 등" },
  { name: "이벤트 페이지 (북토크 등)", price: "200,000원", desc: "단발 이벤트" },
  { name: "사이트 부분 리뉴얼", price: "600,000원~", desc: "6개월~1년 단위" },
  { name: "책 코칭 5개월 ⭐", price: "2,000,000원", desc: "검백챌·코칭 포함" },
];

const compareRows = [
  { label: "타깃", basic: "막 시작하는 작가", standard: "책 1권 이상 낸 작가", premium: "활발한 1인 사업가" },
  { label: "구축비", basic: "300,000원", standard: "800,000원", premium: "1,500,000원" },
  { label: "월 운영비", basic: "90,000원", standard: "190,000원", premium: "390,000원" },
  { label: "약정 기간", basic: "12개월", standard: "12개월", premium: "12개월" },
  { label: "페이지 수", basic: "5p 이내", standard: "10p 이내", premium: "무제한" },
  { label: "결제 시스템", basic: "외부 링크", standard: "기본 결제", premium: "멤버십·구독 결제" },
  { label: "뉴스레터", basic: false, standard: "스티비 연동", premium: "자동화 시퀀스" },
  { label: "콘텐츠 발행", basic: "본인 직접", standard: "월 2회 지원", premium: "월 4회 풀 매니지드" },
  { label: "수정 요청", basic: "월 2건", standard: "월 5건", premium: "무제한" },
  { label: "응답 시간", basic: "영업일 48h", standard: "영업일 24h", premium: "영업일 4h" },
  { label: "클라이언트", basic: "신규 우선", standard: "가장 인기 ⭐", premium: "소수 정예 (5명 한정)" },
];

function CellValue({ value }: { value: string | boolean }) {
  if (value === false) return <X size={16} className="text-muted-foreground mx-auto" />;
  if (typeof value === "string" && value.startsWith("✅"))
    return <Check size={16} className="text-primary mx-auto" />;
  return <span>{value}</span>;
}

export default function GoodsPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
      {/* Header */}
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-sm font-medium text-accent uppercase tracking-widest mb-3">Services</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">상품 소개</h1>
        <p className="text-muted-foreground leading-relaxed">
          작가와 1인 사업가에게 꼭 맞는 디지털 운영 파트너십 패키지입니다.
          <br />구축부터 월 운영까지 함께합니다.
        </p>
      </div>

      {/* Comparison table */}
      <div className="mb-20 overflow-x-auto">
        <h2 className="text-xl font-bold text-foreground mb-6">패키지 한눈에 비교</h2>
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-4 bg-muted rounded-tl-lg font-medium text-muted-foreground w-1/4">
                구분
              </th>
              <th className="py-3 px-4 bg-green-50 text-center font-semibold text-foreground">
                🌱 베이직
              </th>
              <th className="py-3 px-4 bg-primary text-center font-semibold text-white relative">
                🌿 스탠다드
                <span className="ml-1.5 text-xs bg-accent text-white px-1.5 py-0.5 rounded-full">
                  추천
                </span>
              </th>
              <th className="py-3 px-4 bg-amber-50 text-center font-semibold text-foreground rounded-tr-lg">
                🌳 프리미엄
              </th>
            </tr>
          </thead>
          <tbody>
            {compareRows.map((row, i) => (
              <tr key={row.label} className={i % 2 === 0 ? "bg-white" : "bg-muted/30"}>
                <td className="py-3 px-4 font-medium text-foreground">{row.label}</td>
                <td className="py-3 px-4 text-center text-muted-foreground">
                  <CellValue value={row.basic} />
                </td>
                <td className="py-3 px-4 text-center text-primary font-medium bg-primary/5">
                  <CellValue value={row.standard} />
                </td>
                <td className="py-3 px-4 text-center text-muted-foreground">
                  <CellValue value={row.premium} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Package detail cards */}
      <div className="mb-20 space-y-12">
        <h2 className="text-xl font-bold text-foreground">패키지 상세</h2>

        {packages.map((pkg) => (
          <div
            key={pkg.id}
            className={`rounded-2xl border-2 overflow-hidden ${pkg.popular ? "border-primary" : "border-border"}`}
          >
            {/* Card header */}
            <div className={`px-6 py-6 ${pkg.popular ? "bg-primary" : "bg-muted/40"}`}>
              {pkg.popular && (
                <span className="inline-flex items-center gap-1 text-xs font-medium bg-accent text-white px-2.5 py-1 rounded-full mb-3">
                  <Star size={11} fill="currentColor" /> 가장 인기
                </span>
              )}
              <h3 className={`text-2xl font-bold mb-1 ${pkg.popular ? "text-white" : "text-foreground"}`}>
                {pkg.emoji} {pkg.name}{" "}
                <span className={`text-base font-normal ${pkg.popular ? "text-blue-200" : "text-muted-foreground"}`}>
                  ({pkg.sub})
                </span>
              </h3>
              <p className={`text-sm mb-5 ${pkg.popular ? "text-blue-100" : "text-muted-foreground"}`}>
                &ldquo;{pkg.tagline}&rdquo; — {pkg.target}
              </p>

              {/* Price table */}
              <div className={`rounded-xl overflow-hidden border ${pkg.popular ? "border-white/20" : "border-border"}`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={pkg.popular ? "bg-white/10" : "bg-white"}>
                      <th className={`py-2 px-4 text-center font-medium border-r ${pkg.popular ? "text-blue-200 border-white/20" : "text-muted-foreground border-border"}`}>
                        구축비
                      </th>
                      <th className={`py-2 px-4 text-center font-medium border-r ${pkg.popular ? "text-blue-200 border-white/20" : "text-muted-foreground border-border"}`}>
                        월 운영비
                      </th>
                      <th className={`py-2 px-4 text-center font-medium ${pkg.popular ? "text-blue-200" : "text-muted-foreground"}`}>
                        약정 / 연 총비용
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={pkg.popular ? "bg-white/5" : "bg-muted/30"}>
                      <td className={`py-3 px-4 text-center font-bold text-lg border-r ${pkg.popular ? "text-white border-white/20" : "text-foreground border-border"}`}>
                        {pkg.setupFee}
                      </td>
                      <td className={`py-3 px-4 text-center font-bold text-lg border-r ${pkg.popular ? "text-white border-white/20" : "text-foreground border-border"}`}>
                        {pkg.monthlyFee}
                      </td>
                      <td className={`py-3 px-4 text-center ${pkg.popular ? "text-blue-100" : "text-muted-foreground"}`}>
                        <span className="block font-medium">{pkg.contract}</span>
                        <span className="text-xs">연 약 {pkg.annualTotal}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card body */}
            <div className="bg-white divide-y divide-border">
              {/* Build scope */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                  📦 구축 범위
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {pkg.buildItems.map((item, i) => (
                      <tr key={item.label} className={i % 2 === 0 ? "bg-muted/30" : "bg-white"}>
                        <td className="py-2 px-3 text-muted-foreground w-2/5 rounded-l">{item.label}</td>
                        <td className="py-2 px-3 font-medium text-foreground rounded-r">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Operation scope */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                  🔧 월 운영 범위
                </p>
                <table className="w-full text-sm">
                  <tbody>
                    {pkg.operItems.map((item, i) => (
                      <tr key={item.label} className={i % 2 === 0 ? "bg-muted/30" : "bg-white"}>
                        <td className="py-2 px-3 text-muted-foreground w-2/5 rounded-l">{item.label}</td>
                        <td className="py-2 px-3 font-medium text-foreground rounded-r">{item.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Target + CTA */}
              <div className="px-6 py-5">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                  🎯 이런 분께 추천
                </p>
                <ul className="space-y-2 mb-5">
                  {pkg.targets.map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check size={14} className="text-primary flex-shrink-0 mt-0.5" />
                      {t}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/contact"
                  className={`inline-flex items-center justify-center gap-2 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                    pkg.popular
                      ? "bg-primary text-white hover:bg-primary/90"
                      : "border border-border text-foreground hover:bg-muted"
                  }`}
                >
                  상담 신청하기 <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add-on options */}
      <div className="mb-16">
        <div className="mb-6">
          <p className="text-sm font-medium text-accent uppercase tracking-widest mb-2">Add-on</p>
          <h2 className="text-xl font-bold text-foreground">추가 옵션</h2>
          <p className="text-sm text-muted-foreground mt-1">
            구축 시 또는 운영 중 언제든 추가 가능합니다.
          </p>
        </div>

        <div className="space-y-10">
          {/* One-time options */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4">
              🔧 일회성 옵션 (구축 추가)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addonOnetime.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-white"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary ml-4 flex-shrink-0">
                    {item.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly options */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4">
              🔄 월 운영 옵션 (구독 추가)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addonMonthly.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-white"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary ml-4 flex-shrink-0">
                    {item.price}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Project options */}
          <div>
            <h3 className="text-base font-semibold text-foreground mb-4">
              🚀 프로젝트형 옵션 (단발 의뢰)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {addonProject.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-4 rounded-lg border border-border bg-white"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary ml-4 flex-shrink-0">
                    {item.price}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="rounded-2xl bg-primary px-8 py-10 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">어떤 패키지가 맞을지 모르겠다면?</h2>
        <p className="text-blue-200 mb-6 text-sm">
          무료 상담을 통해 현재 상황에 맞는 패키지를 추천해 드립니다.
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
