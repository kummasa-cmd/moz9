# Stage 6-D3b — 관리자 세션 서명 비밀 분리 (admin-session-v2 연결)

> 상태: **코드 연결·테스트·빌드 완료 (로컬, 미커밋). Production 전환은 별도 승인 대기.**
> 설계 근거: [`docs/sns-lab-admin-session.md`](../sns-lab-admin-session.md) §4–§6 (Stage 6-D2). 6-D2 보고서 JSON(`docs/sns-lab-stage6d2/`)은 기록으로 보존.

## 1. 무엇이 바뀌나

| 항목 | 이전 (v1, 커밋 994690b) | 이후 (v2) |
|---|---|---|
| 서명 키 | `SUPABASE_SERVICE_ROLE_KEY` | `ADMIN_SESSION_SIGNING_SECRET` (전용, 환경별 다른 값) |
| 토큰 | `{ sub, exp }` HS256 | HS256 + `iss`, `aud=moz9:admin:<VERCEL_ENV>`, `iat/nbf/exp`, `jti`, `sv=2` |
| 쿠키 | `admin-token` | 배포 환경 `__Host-moz9-admin-session` (Secure, Path=/), local `moz9-admin-session` |
| secret 없음/약함 | — | **fail-closed**: 로그인 불가, 모든 세션 거부 |
| v1 토큰 | 유효 | **항상 거부** (안 A: 전원 1회 재로그인) |

검증기는 `lib/admin-session/config.ts`의 `verifyAdminSessionCookie()` 하나. `getAdminSession` → `checkAdmin` / `requireAdmin`(Server Action 64개·업로드 route 3개), proxy(`lib/supabase/middleware.ts`), 로그인/로그아웃이 모두 이 경로를 쓴다.

### 변경 파일

- `lib/admin-session/token.ts` — v1 검증기·service-role 키 함수 제거, v2만 남김
- `lib/admin-session/cookie.ts` — v2 쿠키 정책, `__Host-` 쿠키 만료(같은 속성), v1 쿠키는 만료만
- `lib/admin-session/config.ts` — 단일 검증기 `verifyAdminSessionCookie`, `AdminSessionConfigError`(이유 코드만)
- `lib/admin-session/proxy-gate.ts` — 주석 갱신 (동작 동일)
- `lib/admin-session/report.ts`, `scripts/sns-lab/admin-session-report.ts` — 6-D3b 보고서 (`admin-session-v2-security-report.json`)
- `lib/admin-auth.ts` — 발행/검증/로그아웃 v2 연결
- `lib/supabase/middleware.ts` — proxy가 v2 쿠키 이름 + 같은 검증기 사용
- `app/admin/login/actions.ts` — secret 문제 시 일반 오류 메시지, 서버 로그에는 이유 코드만
- `lib/admin-guard.test.ts`, `lib/admin-session/admin-session.test.ts` — v2 기준 테스트

DB migration 없음. cron / webhook / 뉴스레터 발송 / Resend / SNS LAB grant 정책 변경 없음.

## 2. 검증 결과 (로컬, 2026-10-10)

- `npm test` 1403/1403 통과 (admin-session 40, admin-guard 36, admin-guard.coverage 정책 registry 포함)
- `npm run typecheck` 통과
- `npm run build` 통과 — `/admin/*` 전부 ƒ(dynamic), prerender 없음
- `npm run lint` — 오류 4개는 모두 이번에 손대지 않은 파일(`RichEditor`, `AdminSidebar`, `OrderCompanySearch`, `VendorManagerSearch`)의 기존 react-hooks 규칙 위반. 이번 변경 파일에서는 0
- 보안 보고서 `--check` 결정적, adversarial **44/44 차단**, 보고서 내 secret 0 (SNS LAB 전용 케이스 15b는 SNS LAB authority 보고서(6-D1)로 이관 — 이 보고서는 커밋된 코드만 의존)
  - compatibility: v1 세션 수용 false, v1 쿠키 읽기 false, v2 수용 true(proxy 포함), preview 토큰 production 수용 false, secret 없이 수용 false
- client bundle(`.next/static`) 검색: `ADMIN_SESSION_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `admin-secret-fallback`, `moz9:admin-session`, 쿠키 이름, `TEST-ONLY-` → **0건**

## 3. 환경변수 준비 (전환 전, 사용자 작업)

1. 값 생성 — 환경마다 **따로** 생성 (같은 값 재사용 금지):
   ```bash
   openssl rand -base64 48
   # openssl이 없으면
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```
2. Vercel → Project → Settings → Environment Variables에 `ADMIN_SESSION_SIGNING_SECRET` 추가
   - Production / Preview / Development 각각 다른 값, **Sensitive** 체크
   - `NEXT_PUBLIC_` 접두사 절대 금지
3. 로컬: `.env.development.local`에 또 다른 값 추가 (없으면 `npm run dev`에서 관리자 로그인이 막힘)
4. 거부 조건(이유 코드만 로그): 미설정·빈 값·앞뒤 공백·43자 미만·고유 문자 16개 미만·placeholder 포함·Supabase 키 형식·**다른 env 값과 동일**
5. 확인: Settings → Environment Variables에서 "Automatically expose System Environment Variables"가 켜져 있는지 (`VERCEL_ENV`로 환경·쿠키 이름을 정함. 꺼져 있으면 `local`로 취급되어 `Secure` 없는 쿠키가 됨)

env 추가 자체는 현재 운영 코드(v1)에 영향이 없다 — 코드가 아직 읽지 않는다.

## 4. 운영 전환 절차 (승인 후에만)

1. §3 완료 확인 (Production 값 존재)
2. 커밋 (Conventional Commits, 예: `feat: sign admin sessions with a dedicated secret`) — SNS LAB 미커밋 파일과 섞지 않게 관련 파일만
3. Preview 배포에서 먼저 확인: 로그인 → `/admin` → 로그아웃 → 쿠키 `__Host-moz9-admin-session` 확인, 위조 쿠키 → 307 login
4. Production 배포 (push → Vercel). 직전 Production 배포 ID를 기록해 둔다 (현재 `dpl_4BcfWdvYvVMRpyvZEUypkYAkn8p6`, 994690b)
5. **관리자 전원 1회 재로그인** (기존 `admin-token` 세션은 즉시 무효)
6. 배포 후 확인
   - 정상: 로그인/로그아웃, 뉴스레터 목록·편집·테스트 발송 화면(실제 발송 금지), 구독자 화면, 관리자/회원 업로드, SNS LAB 접근
   - 차단: 쿠키 없음/위조 쿠키로 `/admin` → 307, Server Action POST → 307, 업로드 route 4종 → 401
   - 독립: cron(`/api/cron/*`)은 `CRON_SECRET`, webhook은 서명 검증 — 관리자 세션과 무관 (테스트로 고정). 배포 후 다음 cron 실행·webhook 수신 로그 정상 확인
   - 로그: `[admin-auth] session not issued:` 가 보이면 secret 문제 → §5

## 5. 장애 복구 · 롤백

| 증상 | 원인 | 조치 |
|---|---|---|
| 로그인 시 "관리자 로그인을 일시적으로 사용할 수 없습니다" + 로그 `session not issued: MISSING` 등 | Production secret 미설정/거부 | env 수정 후 **재배포**(env 변경은 새 배포부터 반영). 급하면 아래 롤백 |
| 로그인 후 바로 다시 로그인 화면 | 쿠키 미저장(http 접근, `VERCEL_ENV` 미노출) 또는 secret이 배포 간 바뀜 | 도메인 https 확인, §3-5 확인 |
| 그 밖의 관리자 장애 | — | 롤백 |

**롤백** = 직전 Production 배포로 되돌리기 (Vercel Dashboard → Deployments → 직전 배포 → *Instant Rollback* / Promote). 코드 경로 전환이 아니라 빌드 교체다.
- 롤백 후 v1 코드는 `admin-token`만 읽는다. v2 로그인 때 `admin-token`이 만료되었으므로 **관리자는 다시 한 번 로그인**해야 한다.
- `ADMIN_SESSION_SIGNING_SECRET`은 남겨 둬도 v1 코드에 무해.
- DB 변경이 없으므로 데이터 복구 대상 없음.

## 6. 남은 위험

- 서명이 유효한 토큰의 서버측 즉시 폐기(로그아웃·비밀번호 변경 시) 없음 — `jti` 폐기 테이블 필요(후속, migration 필요). 탈취 시 최대 24h 유효.
- secret 교체 = 전원 로그아웃 (의도된 동작). 교체 주기·절차는 운영 문서화 필요.
- 로그인 rate limit 없음.
- lint 기존 오류 4개(관리자 UI 컴포넌트) 미해결 — 이번 범위 밖.
- 실제 브라우저에서의 `__Host-` 쿠키 동작은 Preview 배포에서만 검증 가능(로컬은 http라 unprefixed 쿠키).

## 7. Production 전환 승인에 필요한 것

1. Production / Preview / Development `ADMIN_SESSION_SIGNING_SECRET` 설정 완료 (사용자)
2. 관리자 재로그인 공지 여부·시점
3. 커밋 범위 승인 (§1 변경 파일만, SNS LAB 제외)
4. Preview 검증 → Production 배포(push) 승인
5. 롤백 기준 배포 ID 확인 (`dpl_4BcfWdvYvVMRpyvZEUypkYAkn8p6`)
