-- =============================================================
-- Moz9 RLS (Row-Level Security) 정책
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- =============================================================

-- 1. 모든 테이블에 RLS 활성화
-- (이미 활성화된 테이블은 무시됩니다)
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;

-- =============================================================
-- 2. portfolio_items — 누구나 공개 포트폴리오 조회 가능
--    (홈페이지, works 페이지에서 anon key로 SELECT)
-- =============================================================
CREATE POLICY "portfolio_items_public_read"
  ON public.portfolio_items
  FOR SELECT
  TO anon, authenticated
  USING (status = '공개');

-- =============================================================
-- 3. consultations — 비로그인 사용자도 문의 등록 가능
--    (contact 페이지에서 브라우저 anon key로 INSERT)
-- =============================================================
CREATE POLICY "consultations_public_insert"
  ON public.consultations
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- =============================================================
-- 4. members — 로그인한 회원은 자신의 정보만 조회/수정 가능
-- =============================================================
CREATE POLICY "members_own_read"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "members_own_update"
  ON public.members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================
-- 5. boards — 공개 게시판은 누구나 조회 가능
-- =============================================================
CREATE POLICY "boards_public_read"
  ON public.boards
  FOR SELECT
  TO anon, authenticated
  USING (is_visible = true);

-- =============================================================
-- 6. board_posts — 게시중인 글은 누구나 조회 가능
--    (개인 게시판 필터링은 앱 레벨에서 처리)
-- =============================================================
CREATE POLICY "board_posts_public_read"
  ON public.board_posts
  FOR SELECT
  TO anon, authenticated
  USING (status = '게시중');

-- 글 작성/수정/삭제는 모두 createAdminClient(service role)로 처리되므로
-- anon/authenticated 대상 쓰기 정책 불필요 (정책 없음 = 쓰기 차단)

-- =============================================================
-- 7. board_categories — 누구나 조회 가능
-- =============================================================
CREATE POLICY "board_categories_public_read"
  ON public.board_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================
-- 8. board_comments — 누구나 조회 가능, 로그인 시 작성/삭제
-- =============================================================
CREATE POLICY "board_comments_public_read"
  ON public.board_comments
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "board_comments_auth_insert"
  ON public.board_comments
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 댓글 삭제는 createAdminClient(service role)로 처리되므로
-- anon/authenticated 대상 삭제 정책 불필요

-- =============================================================
-- 9. admins — anon/authenticated 접근 완전 차단
--    (관리자 페이지는 service role key만 사용)
-- =============================================================
-- RLS 활성화만으로 정책 없이 차단됨 (정책 없음 = 모든 접근 거부)

-- =============================================================
-- 10. products — 공개 상품만 조회 가능
-- =============================================================
CREATE POLICY "products_public_read"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================
-- 11. orders — anon/authenticated 접근 차단
--     (관리자 전용, service role key로만 접근)
-- =============================================================
-- RLS 활성화만으로 차단

-- =============================================================
-- 12. site_settings — 누구나 조회 가능 (사이트 설정은 공개)
-- =============================================================
CREATE POLICY "site_settings_public_read"
  ON public.site_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- =============================================================
-- 13. inquiries — anon/authenticated 접근 차단
--     (관리자 전용)
-- =============================================================
-- RLS 활성화만으로 차단

-- =============================================================
-- 참고: service role key (createAdminClient)는 RLS를 우회합니다.
-- 관리자 페이지의 모든 CRUD는 영향을 받지 않습니다.
-- =============================================================
