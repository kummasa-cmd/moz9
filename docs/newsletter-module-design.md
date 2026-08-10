# 뉴스레터 모듈 설계도

> 작성일: 2026-07-22
> 목적: 모즈나인 홈페이지에 회원/비회원 통합 뉴스레터 기능을 추가하고, 향후 제작 서비스 고객사 사이트에도 재사용 가능한 모듈로 만든다.
> 이 문서는 Claude Code에 순서대로 던질 수 있는 실행 설계도다. DB 스키마는 이미 `supabase/migrations/0005_newsletter.sql`로 작성되어 있다.

---

## 0. 원안 대비 수정 사항

처음 제시된 아키텍처(Prisma + PostgreSQL + site_id 멀티테넌트)는 이 프로젝트의 실제 스택과 맞지 않아 아래와 같이 조정했다.

| 항목 | 원안 | 이 프로젝트에 맞춘 설계 | 이유 |
|---|---|---|---|
| DB 접근 | Prisma ORM | **Supabase 클라이언트 + raw SQL 마이그레이션** | 이 repo는 Prisma를 쓰지 않는다. `supabase/migrations/*.sql`을 Supabase 대시보드에서 수동 실행하는 기존 방식(0001~0004)을 그대로 따른다. |
| 멀티테넌시 | 모든 테이블에 `site_id` | **site_id 없음. 단일 테넌트 + 폴더 복사형 모듈** | 고객사마다 별도 Vercel 프로젝트 + 별도 Supabase 프로젝트를 쓰는 에이전시 구조이므로, DB를 공유하는 멀티테넌트보다 "모듈 폴더 복사 + `.env` 교체"가 실제 운영 방식과 맞고 단순하다. §8 참고. |
| 회원 연동 | 별도 `Subscriber.userId` | **`newsletter_subscribers.member_id → auth.users`** | `consultations.member_id` (0004 마이그레이션)와 동일한 패턴. 회원가입 시 자동 링크, 비회원은 email만. |
| 이메일 발송사 | Resend / SendGrid / SES 중 택1 | **Resend 확정** | 무료 티어로 테스트하기 쉽고, React Email과 궁합이 좋고 Vercel 배포에 최적화되어 있음. `resend`, `react-email`, `@react-email/components` 신규 설치 필요 (현재 미설치). |
| 스케줄러 | 5분마다 Vercel Cron | **하루 1회 Vercel Cron (자정 KST 기준)** | Vercel **Hobby 플랜은 cron이 하루 1회 실행으로 제한**된다. "매일 자동발송/선택일 발송/기간 발송" 요구사항 자체가 일 단위이므로 하루 1회로 충분하다. 발송 정밀 시각(예: 매일 09:00)이 꼭 필요해지면 Pro 플랜 업그레이드 또는 Supabase `pg_cron`/QStash로 교체. |
| 콘텐츠 블록 | 11종 블록 (product-card, video, columns 등) | **6종으로 축소**: heading, text, image, button, divider, ad_banner | 실제 요구사항("모듈로 추가", "광고 배너 공간")을 충족하는 최소 집합. 필요해지면 타입을 추가하는 구조이지 처음부터 다 만들 필요는 없음. |
| 에디터 | Tiptap 신규 도입 | **기존 `@tiptap/*` 재사용** | 이미 설치되어 있고 board_posts 작성에도 쓰는 걸로 보임. text 블록의 `content.html`을 Tiptap으로 편집. |
| 관리자 인증 | (명시 안 됨) | **기존 `app/admin/(protected)/` 그룹 재사용** | `lib/admin-auth.ts`의 JWT 쿠키 세션이 이미 이 라우트 그룹을 보호하고 있으므로 뉴스레터 관리 페이지도 그 아래 넣으면 별도 인증 작업이 필요 없다. |
| 수신 동의 | 언급 없음 | **명시적 opt-in 필요** | 정보통신망법상 이메일 마케팅은 사전 동의가 필요. 회원가입 폼에 뉴스레터 수신 체크박스(기본 미체크)를 추가해야 하며, 가입만으로 자동 구독시키면 안 됨. §9 참고. |

---

## 1. 시스템 구조

```
lib/newsletter/                      # ← 이식 가능한 모듈 코어 (다른 사이트로 복사)
  config.ts                          # env 기반 설정 (sender, brand color, site url)
  queries.ts                         # Supabase 쿼리 함수 모음
  blocks/                            # 블록 타입 정의 + 렌더러
    types.ts
    web-renderer.tsx                 # React (상세 페이지용)
    email-renderer.ts                # HTML 문자열 (이메일용)
  email/
    resend.ts                        # Resend 클라이언트 wrapper
    templates/                       # React Email 템플릿
  scheduler.ts                       # 캠페인 발송 대상 판정 로직
  tracking.ts                        # open/click 토큰 처리

app/admin/(protected)/newsletter/    # 관리자 페이지 (기존 admin 인증 그룹 안)
app/(site)/newsletter/               # 사용자 페이지 (기존 site 그룹 안)
app/api/newsletter/                  # 공개 API (구독/수신거부/트래킹)
app/api/admin/newsletter/            # 관리자 API (CRUD, 발송, 통계)
app/api/cron/newsletter/             # Vercel Cron 엔드포인트

supabase/migrations/0005_newsletter.sql   # DB 스키마 (완성됨)
```

**이식 원칙**: `lib/newsletter/`는 Supabase 클라이언트, env 값, React 컴포넌트 외에는 이 프로젝트의 다른 코드에 의존하지 않는다. 다른 고객사 사이트에 적용할 때는 이 폴더 + 위 4개 `app/` 하위 폴더 + 마이그레이션 SQL을 복사하고 `.env`만 바꾸면 된다 (§8).

---

## 2. DB 스키마 요약

`supabase/migrations/0005_newsletter.sql`에 7개 테이블 + 1개 스토리지 버킷을 정의했다 (기존 0001_init.sql 컨벤션: `uuid` PK, `timestamptz`, text-enum + check constraint, RLS "Authenticated full access" 정책 그대로 따름).

| 테이블 | 역할 |
|---|---|
| `newsletter_subscribers` | 회원(`member_id` 연결) + 비회원(email만) 통합 구독자. `unsubscribe_token`으로 원클릭 수신거부 |
| `newsletters` | 뉴스레터 콘텐츠. `blocks` jsonb 컬럼에 모듈형 블록 배열 저장 |
| `newsletter_campaigns` | 발송 스케줄 (`send_type`: IMMEDIATE/SCHEDULED/RECURRING/RANGE) |
| `newsletter_deliveries` | 구독자별 개별 발송 기록 — 통계의 원천 |
| `newsletter_click_events` | 이메일 내 링크별 클릭 상세 |
| `newsletter_views` | 상세 페이지(`/newsletter/[slug]`) 조회 로그 |
| `newsletter_ad_banners` | 광고 배너 (이메일/상세페이지 공용) |

실행 방법: Supabase 대시보드 > SQL Editor에서 `0005_newsletter.sql` 실행 (기존 마이그레이션과 동일 절차).

---

## 3. 콘텐츠 블록 스키마

```ts
// lib/newsletter/blocks/types.ts
export type ContentBlock =
  | { id: string; type: "heading"; order: number; content: { text: string; level: 1 | 2 | 3 } }
  | { id: string; type: "text"; order: number; content: { html: string } }        // Tiptap 출력
  | { id: string; type: "image"; order: number; content: { src: string; alt: string; link?: string } }
  | { id: string; type: "button"; order: number; content: { text: string; url: string; style: "primary" | "outline" } }
  | { id: string; type: "divider"; order: number }
  | { id: string; type: "ad_banner"; order: number; content: { bannerId: string } };
```

렌더링은 두 갈래로 나뉜다.

```
blocks (jsonb) → BlockRegistry
                   ├─ web-renderer.tsx   → /newsletter/[slug] (React 컴포넌트)
                   └─ email-renderer.ts  → 이메일 발송용 HTML 문자열 (React Email 템플릿에 주입)
```

새 블록 타입을 추가할 때는 `types.ts`에 유니온 케이스 추가 + 두 렌더러에 case 추가만 하면 된다. 관리자 에디터는 좌측 블록 팔레트(추가 버튼) + 우측 미리보기 형태.

---

## 4. 페이지 구조

### 관리자 (`app/admin/(protected)/site/newsletter/*`, 기존 admin 세션으로 보호됨)

사이드바 IA는 "사이트관리 > 뉴스레터 관리 > (뉴스레터 발송 관리 / 뉴스레터 발송 목록 / 통계)" 3단계로,
`AdminSidebar`가 3레벨 아코디언을 지원하도록 확장되어 있다 (`components/admin/adminNav.ts`,
`components/admin/AdminSidebar.tsx`). 사이드바 노출 항목은 3개로 압축했고, 뉴스레터 작성과 발송 예약은
한 화면(`manage`)에서 함께 처리한다 — "목록/작성/캠페인" 3개로 나뉘어 있던 최초 설계보다 실사용 동선이 짧다.

| 경로 | 사이드바 노출 | 기능 |
|---|---|---|
| `/admin/site/newsletter/manage` | 뉴스레터 발송 관리 | 새 뉴스레터 작성(블록 에디터) + 발송 예약(즉시/선택일/매일/기간)을 한 폼에서 함께 저장 |
| `/admin/site/newsletter/manage/[id]` | (발송 관리 하위) | 위와 동일한 폼으로 기존 뉴스레터 + 연결된 캠페인을 함께 수정 |
| `/admin/site/newsletter/list` | 뉴스레터 발송 목록 | 뉴스레터 콘텐츠 상태와 발송 예약 상태를 한 테이블에서 확인, 발송 취소/삭제/미리보기 |
| `/admin/site/newsletter/list/[id]/preview` | (목록 하위) | 웹/이메일 미리보기 토글 |
| `/admin/site/newsletter/analytics` | 통계 | 구독자 현황, 조회수 상위 뉴스레터, 등록 경로별 분포 (오픈율/클릭율은 Step 5 발송 연동 후 추가) |
| `/admin/site/newsletter/subscribers` | (사이드바 비노출, `manage` 화면 상단 바로가기로 접근) | 구독자 관리, 개별/일괄 등록, 수신거부 처리 |
| `/admin/site/newsletter/banners` | (사이드바 비노출, `manage` 화면 상단 바로가기로 접근) | 광고 배너 관리 |

기존 `app/admin/(protected)/members/`, `.../consulting/`의 `page.tsx` + `actions.ts` + `XxxTable.tsx` 서버 액션 패턴을 그대로 따른다.

### 사용자 (`app/(site)/newsletter/*`)

| 경로 | 기능 |
|---|---|
| `/newsletter` | 뉴스레터 아카이브 (메인페이지에서 클릭 진입) |
| `/newsletter/[slug]` | 상세 페이지 (블록 렌더링 + 조회 로그 기록) |
| `/newsletter/subscribe` | 구독 신청 폼 (임베드 위젯으로도 재사용 가능) |
| `/newsletter/unsubscribe?token=xxx` | 원클릭 수신거부 |

홈페이지(`/`)에는 최신 뉴스레터 카드 위젯을 추가해 `/newsletter/[slug]`로 연결한다.

---

## 5. API 라우트

```
# 공개
POST   /api/newsletter/subscribe
POST   /api/newsletter/unsubscribe
GET    /api/track/open/:trackingToken        # 1x1 픽셀
GET    /api/track/click/:trackingToken       # 리다이렉트 + 기록 (?url=)

# 관리자 (app/admin/(protected)/newsletter/*/actions.ts 서버 액션 우선, 필요한 것만 route handler)
CRUD   /api/admin/newsletter/newsletters
CRUD   /api/admin/newsletter/campaigns
POST   /api/admin/newsletter/campaigns/:id/send-now
GET    /api/admin/newsletter/analytics/overview
GET    /api/admin/newsletter/analytics/by-date?from=&to=
POST   /api/admin/newsletter/subscribers/import   # CSV

# Cron (Vercel Cron 전용, Authorization: Bearer CRON_SECRET 검증)
POST   /api/cron/newsletter/send-due
```

기존 코드베이스는 admin CRUD를 대부분 **서버 액션**(`actions.ts`)으로 처리하고, 이미지 업로드 등 외부에서 호출돼야 하는 것만 `app/api/*/route.ts`로 뺀다 (`app/api/portfolio-image`, `app/api/board-image` 참고). 뉴스레터도 이 관례를 따른다 — 관리자 CRUD는 액션, 공개 구독/트래킹/크론만 route handler.

---

## 6. 발송 스케줄러

```ts
// app/api/cron/newsletter/send-due/route.ts
// vercel.json: { "crons": [{ "path": "/api/cron/newsletter/send-due", "schedule": "0 0 * * *" }] }
// Hobby 플랜은 하루 1회 제한 → 자정(UTC) = 오전 9시 KST 근처 1회 실행으로 설계.

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = todayInKST(); // date

  const due = await getDueCampaigns(today);
  // - SCHEDULED: scheduled_at의 날짜가 오늘이고 아직 SENT 아님
  // - RECURRING: status='SCHEDULED'인 것 전부 (매일 실행 대상), last_sent_date !== today
  // - RANGE: range_start <= today <= range_end, last_sent_date !== today

  for (const campaign of due) {
    await processCampaign(campaign); // 대상 구독자 조회 → 배치 발송(Resend batch API, 100개씩) → Delivery 기록 → 상태 갱신
  }
}
```

`last_sent_date` 컬럼(마이그레이션에 포함됨)으로 RECURRING/RANGE 캠페인이 하루에 두 번 발송되는 것을 방지한다. IMMEDIATE 발송은 크론을 기다리지 않고 `/campaigns/:id/send-now`에서 바로 처리한다.

---

## 7. 통계

- **오픈 트래킹**: 이메일 본문 하단에 `<img src=".../api/track/open/{trackingToken}" width="1" height="1">` 삽입 → `newsletter_deliveries.opened_at` 갱신
- **클릭 트래킹**: 이메일 내 모든 링크를 `/api/track/click/{trackingToken}?url=...`로 감싸 리다이렉트 시 `newsletter_click_events` insert + `deliveries.click_count` 증가
- **웹 조회**: `/newsletter/[slug]` 방문 시 쿠키 기반 `visitor_id`로 `newsletter_views`에 기록 (당일 중복 제거)
- **대시보드 지표**: 캠페인별 발송/오픈율/클릭율(`newsletter_campaigns`의 캐시 컬럼 사용, 배치 job으로 `newsletter_deliveries` 집계해 갱신), 날짜별 발송량/신규 구독자/수신거부 추이, 구독자 소스별 분포

---

## 8. 이식성 (다른 고객사 사이트 적용)

멀티테넌트 DB 공유 대신 **모듈 폴더 복사 + 환경변수 교체** 방식을 쓴다 (이유는 §0 표 참고).

```
1. lib/newsletter/, app/admin/(protected)/newsletter/, app/(site)/newsletter/,
   app/api/newsletter/, app/api/cron/newsletter/, supabase/migrations/0005_newsletter.sql
   을 새 프로젝트로 복사
2. 새 Supabase 프로젝트에서 0005_newsletter.sql 실행
3. .env 교체:
   RESEND_API_KEY=
   NEWSLETTER_SENDER_NAME=
   NEWSLETTER_SENDER_EMAIL=
   NEWSLETTER_BRAND_COLOR=
   NEXT_PUBLIC_SITE_URL=
   CRON_SECRET=
4. vercel.json에 크론 등록
```

향후 이 모듈을 진짜 npm 패키지로 뽑아낼 수도 있지만, 지금은 고객사 수가 적을 것이므로 **폴더 복사가 npm 패키지 유지보수보다 비용이 낮다** — 3곳 이상 동시 운영하게 되면 그때 패키지화를 고려.

---

## 9. 준수 사항

- **수신 동의(opt-in)**: `/register` 폼과 `/contact` 폼에 "뉴스레터 수신에 동의합니다" 체크박스(기본 미체크)를 추가하고, 체크된 경우에만 `newsletter_subscribers`에 insert. 회원가입=자동구독은 금지 (정보통신망법).
- **수신거부**: 모든 발송 이메일 하단에 수신거부 링크 필수 포함 (`email-renderer.ts`에서 공통 삽입, 블록별로 넣지 않음).
- **개인정보**: `newsletter_click_events.ip_hash`는 원본 IP 대신 해시만 저장 (마이그레이션에 이미 반영).

---

## 10. Claude Code 적용 단계별 프롬프트

```
Step 1 — DB 적용 [완료]
supabase/migrations/0005_newsletter.sql을 Supabase 대시보드 SQL Editor에서 실행해줘.
그리고 package.json에 resend, react-email, @react-email/components를 추가하고 설치해줘.
.env.local.example에 RESEND_API_KEY, NEWSLETTER_SENDER_NAME, NEWSLETTER_SENDER_EMAIL,
NEWSLETTER_BRAND_COLOR, CRON_SECRET, NEXT_PUBLIC_SITE_URL을 추가해줘.
(마이그레이션 SQL 실행 자체는 사용자가 Supabase 대시보드에서 직접 진행)

Step 2 — 모듈 코어 [완료]
docs/newsletter-module-design.md의 §1, §3을 참고해서 lib/newsletter/ 아래에
config.ts, queries.ts, blocks/types.ts, blocks/web-renderer.tsx, blocks/email-renderer.ts를
구현해줘. queries.ts는 lib/supabase/server.ts, lib/supabase/admin.ts 패턴을 따라줘.

Step 3 — 공개 API + 사용자 페이지 [완료]
§4(사용자 페이지), §5(공개 API)를 참고해서
/newsletter, /newsletter/[slug], /newsletter/subscribe, /newsletter/unsubscribe를 구현해줘.
구독은 /contact 폼과 동일하게 브라우저 Supabase 클라이언트로 직접 insert하고,
수신거부는 서버 컴포넌트가 렌더링 시점에 바로 처리해줘 (API 라우트 불필요).
/api/track/open, /api/track/click는 Step 5에서 발송 데이터와 함께 구현.

Step 4 — 관리자 페이지 [완료, IA 재구성됨]
app/admin/(protected)/site/newsletter/ 아래에 만들어줘 (사이트관리 하위,
components/admin/adminNav.ts에 3단계 메뉴로 등록: 뉴스레터 관리 > 뉴스레터 발송 관리/
뉴스레터 발송 목록/통계). AdminSidebar.tsx는 3레벨 아코디언을 지원하도록 확장되어 있음.
- /manage, /manage/[id]: 뉴스레터 작성(블록 에디터) + 발송 예약을 한 폼에서 저장
- /list, /list/[id]/preview: 콘텐츠+발송 상태 통합 테이블, 미리보기
- /analytics: 통계
- /subscribers, /banners: 사이드바 비노출, manage 화면 상단 바로가기로 접근
app/admin/(protected)/members와 .../consulting의 page.tsx + actions.ts + XxxTable.tsx
패턴을 그대로 따른다. 블록 에디터는 기존 @tiptap/* 기반 RichEditor를 재사용.

Step 5 — 발송 + 스케줄러 [완료]
§6을 참고해서 캠페인 발송 로직(lib/newsletter/scheduler.ts)과
/api/cron/newsletter/send-due를 구현해줘. "지금 발송" 버튼은
app/admin/(protected)/site/newsletter/list/NewsletterSendTable.tsx에 추가하고
manage 폼에서 저장한 campaign_id를 기준으로 즉시 발송하는 서버 액션을 연결해줘.
vercel.json에 크론을 등록하고, Resend 발송은 100개씩 배치 처리해줘.
(오픈/클릭 트래킹은 /api/track/open, /api/track/click로 함께 구현됨)

Step 6 — 통계 [완료]
§7을 참고해서 /admin/site/newsletter/analytics 페이지에 캠페인별 오픈율/클릭율과
날짜별 발송/구독 추이를 표시해줘. 차트는 별도 라이브러리 없이(requirements.md의
"외부 라이브러리 최소화" 원칙에 따라) components/admin/newsletter/TrendChart.tsx에
SVG로 직접 구현했고, 브랜드 블루(#3B5BFF) 단일 시리즈로 dataviz 팔레트 검증을 통과했다.
```

각 Step은 이전 Step이 끝난 뒤 순서대로 실행한다. Step 1(DB 마이그레이션 실행)은 되돌리기 어려우므로 실행 전 사용자 확인을 받는다.
