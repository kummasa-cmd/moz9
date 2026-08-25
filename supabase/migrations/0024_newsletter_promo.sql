-- Promotional newsletter feature: a second newsletter track aimed at growing the
-- subscriber base, sent to admin-curated prospect emails rather than existing
-- subscribers. Reuses the same newsletters / newsletter_campaigns /
-- newsletter_deliveries tables and the same block editor as the regular
-- newsletter — see lib/newsletter/scheduler.ts::processCampaign for the
-- audience branching and docs/newsletter-module-design.md for background.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.newsletters
  add column if not exists newsletter_type text not null default 'REGULAR'
    check (newsletter_type in ('REGULAR', 'PROMOTIONAL'));

alter table public.newsletter_campaigns
  add column if not exists audience text not null default 'SUBSCRIBERS'
    check (audience in ('SUBSCRIBERS', 'PROSPECTS'));

-- ---------------------------------------------------------------------------
-- newsletter_prospects (홍보 뉴스레터 발행 대상자 - 아직 구독자가 아닌 잠재 독자,
-- 관리자가 개별/대량 등록)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_prospects (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  source text not null default 'MANUAL'
    check (source in ('MANUAL', 'IMPORT')),
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (email),
  unique (unsubscribe_token)
);

-- ---------------------------------------------------------------------------
-- newsletter_suppressions (홍보/실제 뉴스레터 공통 수신거부 목록) - 여기 등록된
-- 이메일에는 홍보용/실제 뉴스레터 어느 쪽도 발송하지 않는다. 프로모션 뉴스레터의
-- 수신거부 버튼(대상자 unsubscribe_token)과 기존 구독자 수신거부가 모두 여기로
-- 모인다 - lib/newsletter/queries.ts::unsubscribeByToken 참고.
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  unsubscribed_at timestamptz not null default now(),
  unique (email)
);

-- 기존에 실제 뉴스레터를 수신거부한 이메일도 홍보 뉴스레터 대상에서 함께
-- 제외되도록 백필.
insert into public.newsletter_suppressions (email, unsubscribed_at)
select email, coalesce(unsubscribed_at, now())
from public.newsletter_subscribers
where status = 'UNSUBSCRIBED'
on conflict (email) do nothing;

alter table public.newsletter_deliveries
  add column if not exists prospect_id uuid references public.newsletter_prospects (id) on delete set null;

alter table public.newsletter_deliveries
  drop constraint if exists newsletter_deliveries_campaign_id_prospect_id_key;
alter table public.newsletter_deliveries
  add constraint newsletter_deliveries_campaign_id_prospect_id_key unique (campaign_id, prospect_id);

-- ---------------------------------------------------------------------------
-- Row Level Security (기존 컨벤션과 동일: 관리자 전체 접근만 허용. 대상자/수신거부
-- 등록은 전부 관리자 화면 또는 서비스 롤 서버 액션에서만 이뤄지므로 공개 정책 불필요)
-- ---------------------------------------------------------------------------
alter table public.newsletter_prospects enable row level security;
alter table public.newsletter_suppressions enable row level security;

drop policy if exists "Authenticated full access" on public.newsletter_prospects;
create policy "Authenticated full access" on public.newsletter_prospects
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated full access" on public.newsletter_suppressions;
create policy "Authenticated full access" on public.newsletter_suppressions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
