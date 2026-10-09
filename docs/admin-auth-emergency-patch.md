# 관리자 인증 긴급 패치 (Stage 6-D3a)

> 상태: 코드·테스트 완료, **배포 승인 대기**. push / deploy / 환경변수 변경은 하지 않았다.
> 설계 배경: `docs/sns-lab-admin-session.md` (Stage 6-D2 감사).

## 무엇을 막는가

| 취약점 | 조치 |
|---|---|
| proxy가 `admin-token` 쿠키 **존재**만 확인 | 서명·만료 검증 (`lib/admin-session/proxy-gate.ts`), 보조 방어선 |
| 관리자 Server Action 21개 파일(61개 함수) 무검증 | 모든 export 함수 첫 줄 `await requireAdmin()` (`lib/admin-guard.ts`) |
| `site/admins` action은 서명만 확인 | 같은 `requireAdmin()`으로 교체 (삭제된 관리자 차단) |
| 이미지 업로드 route 3개 무인증 | newsletter/portfolio = 관리자만, board = 관리자 또는 탈퇴하지 않은 회원 |
| 업로드 확장자를 클라이언트 파일명에서 가져옴 (member-avatar 포함) | 실제 바이트(magic bytes)로 형식 확인, 확장자는 감지된 형식에서, 이름은 서버 UUID, `upsert:false` |
| JWT fallback 비밀 `"admin-secret-fallback"` | 제거, 키 없으면 fail-closed |
| 서명 알고리즘 미고정 | HS256만 |
| 로그인 후 open redirect | `/admin` 경로만 허용 |
| 삭제된 관리자 토큰이 만료까지 유효 | layout·action·커뮤니티 관리자 권한·member-avatar 모두 `admins` 행 존재 확인 |
| 만료 쿠키로 `/admin` ↔ `/admin/login` redirect loop | proxy가 로그인 페이지를 항상 표시 |

`requireAdmin()` 실패 = `/admin/login?error=…`로 redirect (Next.js `redirect()`가 throw하므로 이후 코드는 실행되지 않는다). Route는 401 JSON. 오류 문구는 원인(만료·위조·삭제)을 구분해 노출하지 않는다.

## 기존 세션

토큰 형식(HS256 `{sub, exp}`), 서명 키(`SUPABASE_SERVICE_ROLE_KEY`), 쿠키(`admin-token`, HttpOnly, Lax, Secure, 24h)는 그대로 → **배포해도 로그인 상태 유지**. 예외: 이미 삭제된 관리자의 세션, 위조·만료 쿠키. v2 세션(`ADMIN_SESSION_SIGNING_SECRET`)은 활성화하지 않는다.

## 배포 전 환경변수 체크리스트 (값은 보지 않는다)

이번 패치가 새로 요구하는 변수는 **없다**. 기존 변수가 Production에 있는지만 확인한다.

Vercel Dashboard → moz9 → Settings → Environment Variables, Environment = Production 필터에서 **이름만** 확인 (Reveal/값 보기 누르지 않기):

- [ ] `SUPABASE_SERVICE_ROLE_KEY` — 세션 서명 키. **없으면 이 패치 이후 관리자 로그인 전면 불가** (fallback 제거)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — board-image 회원 확인

CLI로 확인할 때(값 출력 없음): `vercel env ls production` 출력에서 위 이름이 있는지만 본다. `vercel env pull`은 값을 파일로 내려받으므로 쓰지 않는다.

간접 확인: 현재 운영 관리자 로그인이 되고 있다면 `SUPABASE_SERVICE_ROLE_KEY`가 있다는 뜻이다 (fallback 서명이었다면 `admins` 조회 자체가 실패해 로그인이 불가능).

## 긴급 배포 절차 (승인 후)

이 저장소의 작업 트리에는 미커밋 SNS LAB 작업이 섞여 있다. **패치 파일만** 별도 커밋한다.

1. `git switch -c fix/admin-auth-guard origin/master` (또는 준비된 worktree `../moz9-6d3a` 사용)
2. 아래 "패치 파일 목록"만 반영 → `npm ci && npm test && npm run typecheck && npm run lint && npm run build`
3. 커밋 `fix: require admin session on every admin action and upload route`
4. master에 merge 후 push → Vercel Production 배포 (또는 Preview 배포로 먼저 확인)

## 롤백

- Vercel Dashboard → Deployments → 직전 Production 배포 → "Promote to Production" (Instant Rollback). 코드·DB·env 변경이 없으므로 즉시 원복된다.
- 또는 `git revert <커밋>` 후 push.
- 롤백하면 취약점도 되살아나므로, 롤백 시 즉시 재수정 필요.

## 배포 후 운영 확인

1. 기존 관리자: 재로그인 없이 `/admin` 접속 가능
2. 로그아웃 → 로그인 → 원래 보던 `/admin/...` 경로로 돌아오는지
3. 뉴스레터 목록·편집 화면 열기 (발송·예약 버튼은 누르지 않음), 구독자 목록 열기
4. 뉴스레터 편집기 / 포트폴리오 / 게시판 이미지 업로드 1건씩 (관리자)
5. 회원 계정으로 커뮤니티 글쓰기 이미지 업로드 1건
6. 시크릿 창(쿠키 없음)에서 `/admin` → 로그인 페이지
7. 무인증 업로드 거부: `curl -s -o /dev/null -w "%{http_code}" -X POST https://<도메인>/api/newsletter-image -F file=@x.png` → `401`
8. 위조 쿠키: `curl -s -o /dev/null -w "%{http_code}" -H "Cookie: admin-token=x" https://<도메인>/admin` → `307` (로그인으로)
9. 다음 cron 실행(send-due)과 Resend webhook이 평소처럼 200인지 Vercel 로그 확인 (이 패치는 둘 다 건드리지 않음)

## 패치 파일 목록

수정: `proxy` 경유 `lib/supabase/middleware.ts`, `lib/admin-auth.ts`, `lib/community-auth.ts`, `app/admin/login/actions.ts`, `app/admin/(protected)/layout.tsx`, 관리자 action 22개 파일, `app/api/{board-image,newsletter-image,portfolio-image,member-avatar}/route.ts`

신규: `lib/admin-guard.ts`, `lib/admin-guard.test.ts`, `lib/admin-guard.coverage.test.ts`, `lib/admin-guard.direct-call.test.ts`, `lib/admin-session/{token,cookie,proxy-gate,redirect}.ts`, `lib/uploads/{image-upload,uploader-auth}.ts`, 이 문서

제외(미커밋 유지): SNS LAB 전체, `lib/admin-session/{secret,config,report}.ts`·`admin-session.test.ts`(v2·6-D2 보고서), `components/admin/adminNav.ts`, 뉴스레터 컴포넌트 2개, `package.json`/`package-lock.json`(exceljs)

## 남은 위험

- 로그아웃은 쿠키 삭제뿐: 탈취된 토큰은 만료(24h)까지 유효. 서버측 폐기는 DB 필요(후속).
- 세션 키 = service-role 키 (v2 전환은 별도 승인).
- 단일 관리자 등급: `admins.role`은 저장만 되고 강제되지 않는다 (모든 관리자가 발송·관리자 관리 가능). 역할별 제한은 정책 결정 필요.
- 로그인 rate limit 없음, cron Bearer 비교 상수 시간 아님.
- board-image는 회원 업로드를 허용하므로 회원 계정 남용(대량 업로드) 가능 — 크기·형식만 제한.
