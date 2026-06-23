-- =============================================================
-- members_out 테이블 생성 (회원 탈퇴 기록)
-- Supabase Dashboard > SQL Editor 에서 실행하세요
-- =============================================================

CREATE TABLE IF NOT EXISTS public.members_out (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  nickname text,
  reason text,
  withdrawn_at timestamptz NOT NULL DEFAULT now()
);

-- RLS 활성화 (anon/authenticated 접근 차단, service role만 접근)
ALTER TABLE public.members_out ENABLE ROW LEVEL SECURITY;
