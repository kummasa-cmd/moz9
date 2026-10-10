# Stage 6-D3b — 관리자 세션 서명 비밀 분리 (admin-session-v2 연결)

> 상태: **커밋 `2c6d664` (branch `feat/admin-session-v2`) · Preview 검증 완료 (2026-10-10). Production 전환은 별도 승인 대기.**
> master 미병합, Production 환경변수·배포 변경 없음.
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

### 변경 파일 (커밋 `2c6d664`, 16개)

- `lib/admin-session/token.ts` — v1 검증기·service-role 키 함수 제거, v2만 남김
- `lib/admin-session/cookie.ts` — v2 쿠키 정책, `__Host-` 쿠키 만료(같은 속성), v1 쿠키는 만료만
- `lib/admin-session/config.ts` — 단일 검증기 `verifyAdminSessionCookie`, `AdminSessionConfigError`(이유 코드만)
- `lib/admin-session/secret.ts` — secret 검증 (6-D2 작성, 이번에 처음 커밋)
- `lib/admin-session/proxy-gate.ts` — 주석 갱신 (동작 동일)
- `lib/admin-session/report.ts`, `scripts/sns-lab/admin-session-report.ts` — 6-D3b 보고서. SNS LAB 코드 의존 제거(커밋된 코드만 사용)
- `lib/admin-auth.ts` — 발행/검증/로그아웃 v2 연결
- `lib/supabase/middleware.ts` — proxy가 v2 쿠키 이름 + 같은 검증기 사용
- `app/admin/login/actions.ts` — secret 문제 시 일반 오류 메시지, 서버 로그에는 이유 코드만
- `lib/admin-guard.test.ts`, `lib/admin-session/admin-session.test.ts` — v2 기준 테스트
- 문서·보고서: 이 README, `admin-session-v2-security-report.json`, `docs/sns-lab-admin-session.md`, `docs/sns-lab-stage6d2/…json`

DB migration 없음. cron / webhook / 뉴스레터 발송 / Resend / SNS LAB grant 정책 변경 없음.

## 2. 로컬 검증 (2026-10-10)

- 작업 트리: `npm test` 1403/1403 통과, typecheck 통과, build 통과 (`/admin/*` 전부 ƒ dynamic)
- **커밋만 담은 깨끗한 worktree**(SNS LAB 파일 없음, `npm ci`): test 689 통과 / 0 실패 / 2 skip, typecheck 통과, build 통과, 보고서 `--check` 일치
- lint: 변경 파일 오류 0. 프로젝트 전체 오류 4개는 손대지 않은 파일(`RichEditor`, `AdminSidebar`, `OrderCompanySearch`, `VendorManagerSearch`)의 기존 react-hooks 규칙 위반
- 보안 보고서: adversarial **44/44 차단**, 보고서 내 secret 0 (SNS LAB 전용 케이스 15b는 SNS LAB authority 보고서(6-D1)로 이관)
  - compatibility: v1 세션 수용 false, v1 쿠키 읽기 false, v2 수용 true(proxy 포함), preview 토큰 production 수용 false, secret 없이 수용 false
- client bundle(`.next/static`) 검색: `ADMIN_SESSION_SIGNING_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `admin-secret-fallback`, `moz9:admin-session`, 쿠키 이름, `TEST-ONLY-` → **0건**
- 커밋 전후 미커밋 파일 202개(SNS LAB 포함) 해시 동일

## 3. Preview 검증 (2026-10-10)

- 배포: `dpl_DxmnRk1CG4nozgTzpqPhTC7pdVRc` (READY, target preview, commit `2c6d664`)
  - https://moz9-ce88gulz6-hong-sung-ho-s-projects.vercel.app · alias `moz9-git-feat-admin-session-v2-hong-sung-ho-s-projects.vercel.app`
- env: `ADMIN_SESSION_SIGNING_SECRET` **Preview 전용, Sensitive** (값은 대화·로그에 노출되지 않음). Production에는 없음 — 처음에 Production 대상으로 잘못 추가된 항목은 사용자가 삭제함.
- Preview에는 `CRON_SECRET`·Resend 키가 없어 발송·cron 실행 불가.

| 항목 | 결과 | 확인 방법 |
|---|---|---|
| v2 관리자 로그인 | ✅ 성공 | 사용자, Edge |
| `/admin` 대시보드 | ✅ 정상 | 사용자 |
| `__Host-moz9-admin-session` 생성 | ✅ | 사용자, DevTools |
| HttpOnly / Secure | ✅ | 사용자, DevTools |
| v1 `admin-token` 쿠키 | ✅ 없음 | 사용자, DevTools |
| 로그아웃 → v2 쿠키 삭제 | ✅ | 사용자 |
| 로그아웃 후 `/admin` | ✅ `/admin/login`으로 이동 | 사용자 |
| 구독자 관리 화면 | ✅ 정상 | 사용자 |
| 뉴스레터 발송 관리·예약 목록 | ✅ 정상 (발송 안 함) | 사용자 |
| 무인증 POST `/api/board-image` | ✅ **401** application/json | 사용자, Vercel 인증 통과 후 (앱 차단) |
| 무인증 POST `/api/newsletter-image` | ✅ **401** application/json | 동일 |
| 무인증 POST `/api/portfolio-image` | ✅ **401** application/json | 동일 |
| 같은 3개, Vercel 로그인 없이 (curl) | 302 → `vercel.com/sso-api` | Claude — Vercel Authentication 차단(앱 미도달), 위 401과 구분 |
| SNS LAB | 제외 | 미커밋 로컬 코드라 Preview에 없음 |

업로드 route는 인증 확인이 첫 줄이고 본문을 읽기 전이라, 무인증 빈 POST는 storage·DB에 닿지 않는다.

**Preview에서 브라우저로 확인하지 않은 것** (테스트·보고서로만 확인): 위조·v1·만료 쿠키 주입 후 거부, 무인증 Server Action POST, Preview Supabase가 운영 DB인지 여부. → §6 배포 후 확인에 포함.

## 4. Production 전환 전 남은 조건

1. **Production secret 설정** (사용자, Vercel 대시보드): `ADMIN_SESSION_SIGNING_SECRET`, Production만, Sensitive, **Preview와 다른 새 값**. 값은 대화에 붙여 넣지 않는다.
   ```bash
   node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))" | clip
   ```
   - env 추가만으로는 운영(v1, `994690b`)에 영향 없음 — 코드가 읽지 않고, 새 배포부터 반영.
2. "Automatically expose System Environment Variables" 켜짐 확인 (`VERCEL_ENV`로 쿠키 이름·audience 결정)
3. 관리자 재로그인 공지 여부·시점 (전환 즉시 기존 세션 전부 무효)
4. 배포 시점: 예약 발송 직전·발송 중은 피한다 (cron은 관리자 세션과 무관하지만 장애 대응 여유 확보)
5. 사용자 승인: master 병합 + push(= Production 배포)

## 5. 최종 배포 절차 (승인 후에만)

1. Vercel에서 Production env 존재 확인 (값 제외, 메타데이터만)
2. 롤백 기준 기록: 현재 Production `dpl_4BcfWdvYvVMRpyvZEUypkYAkn8p6` (commit `994690b`)
3. 로컬: `git switch master` → `git merge --ff-only feat/admin-session-v2` (fast-forward만, SNS LAB 미커밋 파일은 그대로) → `git push origin master`
4. Vercel Production 빌드 READY 확인, 새 배포 ID 기록
5. 관리자 재로그인

## 6. 배포 후 확인

- 정상: 로그인 → `__Host-moz9-admin-session` (HttpOnly·Secure), `admin-token` 없음, 대시보드·구독자·뉴스레터 화면(발송 금지), 로그아웃 → 쿠키 삭제
- 차단 (외부 curl): 쿠키 없음 / `admin-token=<임의값>` / 위조 `__Host-` 쿠키로 `/admin` → 307 `/admin/login`, Server Action POST → 307, 업로드 route 무인증 POST → 401
- 독립: 다음 cron 실행 정상(`/api/cron/newsletter`, `CRON_SECRET`), Resend webhook 수신 정상(`/api/webhooks/resend`, 서명 검증)
- 로그: `[admin-auth] session not issued:` 없음

## 7. 장애 복구 · 롤백

| 증상 | 원인 | 조치 |
|---|---|---|
| "관리자 로그인을 일시적으로 사용할 수 없습니다" + 로그 `session not issued: MISSING` 등 | Production secret 미설정/거부 | env 수정 후 **재배포**(env 변경은 새 배포부터 반영). 급하면 롤백 |
| 로그인 후 곧바로 다시 로그인 화면 | 쿠키 미저장(http 접근, `VERCEL_ENV` 미노출) 또는 secret이 배포 간 바뀜 | https·§4-2 확인 |
| 그 밖의 관리자 장애 | — | 롤백 |

**롤백 (1순위, 즉시)**: Vercel Dashboard → Deployments → `dpl_4BcfWdvYvVMRpyvZEUypkYAkn8p6` → *Instant Rollback*. 코드 분기가 아니라 빌드 교체.
- 롤백 후 v1 코드는 `admin-token`만 읽는다. v2 로그인 때 `admin-token`이 만료됐으므로 **관리자는 한 번 더 로그인**.
- `ADMIN_SESSION_SIGNING_SECRET`은 남겨 둬도 v1 코드에 무해.
- DB 변경이 없으므로 데이터 복구 대상 없음. cron·webhook은 롤백과 무관하게 계속 동작.

**롤백 (2순위, 코드 정리)**: Instant Rollback 뒤 master에 `git revert 2c6d664` 커밋을 push해야 다음 배포가 v2로 되돌아가지 않는다 (별도 승인).

## 8. 남은 위험

- 서명이 유효한 토큰의 서버측 즉시 폐기(로그아웃·비밀번호 변경 시) 없음 — `jti` 폐기 테이블 필요(후속, migration). 탈취 시 최대 24h 유효.
- secret 교체 = 전원 로그아웃 (의도된 동작). 교체 절차 문서화 필요.
- 로그인 rate limit 없음.
- Preview가 운영 Supabase를 쓰는지 미확인 — 쓴다면 Preview 관리자 화면에서 운영 데이터를 바꿀 수 있으므로 Preview 사용 시 주의.
- lint 기존 오류 4개(관리자 UI 컴포넌트) 미해결 — 범위 밖.
- 로컬 `npm run dev`는 `.env.development.local`에 secret이 없으면 관리자 로그인 불가.
