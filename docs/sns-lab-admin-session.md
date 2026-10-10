# 관리자 세션 비밀 감사 · 강화 (Stage 6-D2, admin-session-v2)

> 상태: **감사 + 최소 강화 + v2 설계·테스트 완료, 운영 전환은 승인 대기.**
> **Stage 6-D3b (2026-10-10):** v2 코드 연결 완료(로컬, Production 전환 승인 대기). §6 절차의 2–3번은 끝났다. 전환·롤백은 [`docs/sns-lab-stage6d3b/README.md`](sns-lab-stage6d3b/README.md) 참고.
> Production 환경변수, 운영 세션, DB, 배포는 변경하지 않았다.
> 재현 보고서: `npx tsx scripts/sns-lab/admin-session-report.ts [--check]` → `docs/sns-lab-stage6d2/admin-session-v2-security-report.json` (Fake secret / Fake admin / 고정 시계).

## 1. 기존 인증 경로 (감사 결과)

| 경로 | 위치 | 인증 방식 | 비고 |
|---|---|---|---|
| 로그인 | `app/admin/login/actions.ts` `login` | `admins` 행 + bcrypt → `createAdminSession` | redirect 대상이 사용자 입력 그대로였음 (open redirect) |
| 세션 발행 | `lib/admin-auth.ts` `createAdminSession` | HS256 JWT `{sub, exp=24h}`, 키 = `SUPABASE_SERVICE_ROLE_KEY` **없으면 `"admin-secret-fallback"`** | iss/aud/iat/버전 없음 |
| 세션 검증 | `lib/admin-auth.ts` `getAdminSession` | `jwtVerify(token, key)` — 알고리즘 미고정(HS256/384/512 허용) | 같은 fallback |
| 쿠키 | `admin-token` | HttpOnly, Secure(NODE_ENV=production일 때), SameSite=Lax, Path=/, 24h | |
| 로그아웃 | `clearAdminSession` | 쿠키 삭제만 (stateless — 탈취된 토큰은 만료까지 유효) | |
| proxy | `proxy.ts` → `lib/supabase/middleware.ts` | `/admin/*`에서 **쿠키 존재만** 확인 | 서명 검증 없음 |
| 관리자 페이지 | `app/admin/(protected)/layout.tsx` | `getAdminSession()` (서명·만료) | 페이지 렌더 시에만 실행 |
| 관리자 Server Actions | `app/admin/(protected)/**/actions.ts` | **대부분 자체 검증 없음** — `site/admins`만 `getAdminSession`, `sns-lab`은 `requireAdmin` | 아래 V1 |
| SNS LAB | `lib/sns-lab/guard.ts` `checkAdmin` | `getAdminSession` + `admins` 행 존재 확인 | authority-v1은 `checkAdmin` 재사용 |
| 커뮤니티 관리자 권한 | `lib/community-auth.ts` `isAdmin` | `getAdminSession` | |
| `/api/member-avatar` | route | Supabase 회원 **또는** `getAdminSession` | |
| `/api/board-image`, `/api/newsletter-image`, `/api/portfolio-image` | route | **인증 없음** | 아래 V5 |
| cron (`/api/cron/newsletter/*`) | route | `Authorization: Bearer CRON_SECRET` | 관리자 JWT와 독립 |
| Resend webhook | route | svix 서명 (`RESEND_WEBHOOK_SECRET`) | 관리자 JWT와 독립 |
| 회원 (`/mypage`) | proxy | Supabase Auth 세션 + service-role로 `members` 조회 | 관리자 JWT와 독립 |

관련 환경변수(이름만): `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CRON_SECRET`, `RESEND_WEBHOOK_SECRET`, `SNS_LAB_CRON_SECRET`, `NODE_ENV`, (Vercel) `VERCEL_ENV`. 신규 제안: `ADMIN_SESSION_SIGNING_SECRET`.

dev는 별도 Supabase 프로젝트(moz9-dev)라 service-role 키가 달라 dev/prod 세션은 이미 서로 호환되지 않는다. Vercel Preview가 Production과 같은 service-role 키를 쓰면 Preview에서 발급된 세션이 Production에서도 유효하다 (Vercel 설정 확인 필요 — 이 Stage에서는 조회하지 않음).

## 2. 발견된 취약점

| ID | 위험도 | 내용 | 이번 Stage |
|---|---|---|---|
| V1 | **Critical** | proxy가 쿠키 **존재**만 확인하고, 대부분의 관리자 Server Action(뉴스레터·구독자·회원·주문·게시판 등 21개 "use server" 파일)에 자체 검증이 없음 → `admin-token=x` 같은 임의 쿠키와 action id만 있으면 관리자 action 실행 가능 (action id는 공개 JS chunk에 있음) | **완화**: proxy가 서명·만료를 검증 (기존 세션 호환) |
| V2 | High (잠재) | `SUPABASE_SERVICE_ROLE_KEY` 미설정 시 하드코딩 fallback `"admin-secret-fallback"`으로 서명·검증 → 누구나 관리자 토큰 위조 | **수정**: fallback 제거, 키 없으면 fail-closed |
| V3 | Medium | 세션 서명 키 = service-role 키 재사용. 키 하나가 DB 전권 + 관리자 세션 위조를 겸함, Supabase 키 교체 = 전체 로그아웃, Preview/Production 키 공유 시 세션 공유 | **설계·테스트** (v2), 전환은 승인 대기 |
| V4 | Low | 검증 알고리즘 미고정 (HS384/HS512 수용) | **수정**: HS256 고정 |
| V5 | High | 이미지 업로드 route 3개가 인증 없이 service-role로 공개 버킷에 업로드 | 보고만 (route 수정은 범위 밖) |
| V6 | Medium | 로그인 후 redirect가 사용자 입력 그대로 → open redirect (`/admin/login?redirect=https://…`) | **수정**: `/admin` 경로만 허용 |
| V7 | Medium | 삭제된 관리자의 토큰이 만료(최대 24h)까지 일반 관리자 화면·action에서 유효 (SNS LAB만 행 존재 확인) | 보고만 |
| V8 | Low | 로그아웃이 쿠키 삭제뿐 (서버측 폐기 없음), iss/aud/iat/버전 claim 없음 | v2에서 iss/aud/iat/nbf/jti/sv 추가, 폐기 목록은 DB 필요 → 후속 |
| V9 | Low | cron Bearer 비교가 상수 시간 아님 (`!==`) | 보고만 (cron 변경 금지) |
| V10 | Low | 만료된 쿠키가 남아 있으면 `/admin` ↔ `/admin/login` redirect loop 가능 (layout은 거부, proxy는 존재만 보고 되돌림) | proxy 검증으로 해소 |
| V11 | Low | `admins.role`은 저장되지만 어디서도 확인하지 않음 (단일 관리자 등급) | 보고만 |

## 3. 이번 Stage 변경 (운영 세션 호환)

1. `lib/admin-auth.ts`: fallback 제거(키 없으면 발행은 throw, 검증은 null), 검증은 `verifyLegacyAdminToken`(HS256 고정, `sub`/`exp` 필수). 토큰 형식·쿠키 이름·옵션은 그대로 → **기존 세션 그대로 유효**.
2. `lib/supabase/middleware.ts` (proxy): `/admin/*`에서 쿠키 존재 대신 서명·만료 검증 (`adminGateDecision`). 유효 세션은 그대로 통과, 위조·만료 쿠키는 로그인으로.
3. `app/admin/login/actions.ts`: `safeAdminRedirect`로 redirect 대상 제한.
4. `lib/admin-session/` (server-only, 신규): secret 검증, v1 강화 검증기, v2 발행·검증, 쿠키 정책, proxy gate, redirect 검증, 재현 보고서. v2는 **아무 데서도 사용하지 않음**.

운영 영향: `SUPABASE_SERVICE_ROLE_KEY`가 설정된 정상 환경에서는 로그인 상태 유지, 재로그인 불필요. 바뀌는 것은 (a) 위조·만료 쿠키가 proxy에서 걸러짐, (b) 외부 redirect 불가, (c) HS384/512 토큰 거부 (이 코드가 발행한 적 없음). 복구: 해당 커밋 revert만으로 원상 복귀 (DB·env 변경 없음).

## 4. v2 설계 (admin-session-v2, 승인 후 전환)

**Secret** `ADMIN_SESSION_SIGNING_SECRET` (`lib/admin-session/secret.ts`)
- 생성: `openssl rand -base64 48` (환경마다 따로, Production / Preview / Development 각각 다른 값)
- 거부(fail-closed, 이유 코드만 반환하고 값은 절대 출력하지 않음): 미설정, 빈 값, 앞뒤 공백, 43자 미만, 고유 문자 16개 미만, 알려진 placeholder/fallback 포함, Supabase 키 형식(`eyJ…`, `sb_secret_…`), **다른 환경변수 값과 동일**(service-role, anon, CRON_SECRET, webhook secret 등)
- fallback 없음. `NEXT_PUBLIC_` 변형 금지(테스트로 강제).

**JWT** (`lib/admin-session/token.ts`)
- 발행: `alg=HS256, typ=JWT`, `iss=moz9:admin-session`, `aud=moz9:admin:<VERCEL_ENV|local>`, `sub=<admin uuid>`, `iat`, `nbf=iat`, `exp=iat+24h`, `jti=random uuid`, `sv=2`
- 검증: `algorithms:["HS256"]`(none·RS256 혼동·HS512 거부), typ, iss, aud(환경 바인딩), 필수 claim 전부, `sv === 2`(정수), iat 미래 60s 초과 거부, `exp-iat ≤ 24h`, sub UUID, clock skew 60s
- 토큰에서는 **adminId만** 꺼낸다. role / authority / grants claim은 읽지 않는다 → 권한 상승 불가.

**Cookie** (`lib/admin-session/cookie.ts`): 배포 환경은 `__Host-moz9-admin-session`(Secure, Path=/, Domain 없음 강제), local은 `moz9-admin-session`. HttpOnly, SameSite=Lax(Server Actions는 Next.js가 Origin 검사), 24h. 이름이 달라 v1/v2 쿠키가 섞이지 않는다.

## 5. Legacy 세션 전환 비교

| 안 | 보안 | 운영 영향 | 복잡도 |
|---|---|---|---|
| **A. 전체 무효화 후 재로그인** | v1(service-role 서명) 토큰이 즉시 무의미해짐. 구 키 의존 완전 제거 | 관리자 전원 1회 재로그인 (관리자 수 적음, 세션 원래 24h) | 최소 — 분기 없음 |
| B. 기한부 legacy 허용 | 기한 동안 service-role 서명 토큰 계속 유효, 기한 관리·제거 커밋 필요 | 재로그인 없음 | 중간 — 이중 검증 경로, 제거 누락 위험 |
| C. versioned token만 도입 | `sv`로 구분은 되지만 v1 수용 여부는 결국 A/B 중 선택 | — | v2에 이미 포함 |

**권고: A + C.** v2는 `sv=2`를 갖고, v1 토큰은 v2 검증기에서 항상 거부된다(보고서 `18-legacy-in-v2`). legacy fallback 코드는 처음부터 만들지 않는다.

## 6. 운영 전환 절차 (승인 후, 이 Stage에서 실행하지 않음)

1. Vercel에 `ADMIN_SESSION_SIGNING_SECRET`을 Production / Preview / Development **각각 다른 값**으로 추가 (Sensitive). 로컬은 `.env.development.local`에 별도 값.
2. `lib/admin-auth.ts`의 발행·검증을 `adminSessionV2Config(process.env)` + `signAdminSessionV2` / `verifyAdminSessionV2` + `v2CookiePolicy`로 교체, proxy도 같은 검증기·쿠키 이름 사용, 로그아웃은 v1·v2 쿠키 모두 삭제.
3. `admin-session.test.ts`의 "v2 not wired yet" 테스트를 "v1 not accepted" 테스트로 교체.
4. 배포 → 관리자 전원 1회 재로그인 (안내 필요).
5. 확인: 로그인, 로그아웃, 뉴스레터 화면, SNS LAB 접근.
6. 롤백: 커밋 revert → v1 경로 복귀(그 사이 발급된 v2 쿠키는 무시되고 다시 로그인). env는 남겨 둬도 무해.

**전제:** env 미설정 상태로 2번 코드를 배포하면 fail-closed로 **관리자 로그인 전면 불가** → 1번을 반드시 먼저.

## 7. 권한 분리 (authority-v1 유지)

- `checkAdmin()` = 일반 관리자 인증만. 반환은 `{ adminId }`.
- `verification.approve`는 서버 GrantRegistry의 명시적 grant로만, `verification.issue`는 service actor 전용(사람에게 grant해도 제거됨).
- JWT claim, 사용자 입력으로 authority를 지정하는 경로 없음 (보고서 `15-claims-escalation`, `15b-human-issue-grant`).
- authority-v1 Fake Registry는 그대로 (운영 DB 교체 안 함).

## 8. 알려진 한계

- 서명이 유효한 토큰의 서버측 폐기(로그아웃·비밀번호 변경 즉시 무효화)는 DB 테이블이 필요 → 후속 Stage.
- V1은 proxy에서 완화했지만, 다층 방어로는 각 관리자 Server Action 첫 줄에 `requireAdmin` 추가가 필요(삭제된 관리자 차단 포함) → 뉴스레터 파일 수정이 필요해 후속 Stage.
- V5 업로드 route 인증, V9 cron 상수 시간 비교는 이번 범위 밖.
- 로그인 rate limit 없음.
