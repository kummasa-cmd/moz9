-- Newsletter module (구독자 / 뉴스레터 콘텐츠 / 발송 캠페인 / 통계 / 광고 배너)
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- Design notes:
-- - This project has no Prisma / ORM — schema is raw SQL, applied manually, same as
--   0001_init.sql. Table names follow the existing snake_case + text-enum-via-check
--   convention (see public.members, public.consultations).
-- - Single-tenant: no site_id column. This app is one Vercel project + one Supabase
--   project per client site, so portability to another site means copying the
--   newsletter module folder + this migration into a fresh project and swapping
--   .env values, not sharing one DB across sites. See docs/newsletter-module-design.md.
-- - newsletter_subscribers.member_id links to auth.users the same way
--   consultations.member_id already does (0004_consultations_member_fields.sql),
--   so a subscriber can optionally be tied to a logged-in member without requiring
--   an account (non-member email-only subscribers are first-class).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- newsletter_subscribers (회원 + 비회원 통합 구독자)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  member_id uuid references auth.users (id) on delete set null,
  source text not null default 'MANUAL'
    check (source in ('WEBSITE', 'MEMBER_SIGNUP', 'IMPORT', 'MANUAL', 'CONTACT_FORM')),
  status text not null default 'SUBSCRIBED'
    check (status in ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED')),
  tags text[] not null default '{}',
  unsubscribe_token uuid not null default gen_random_uuid(),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (email),
  unique (unsubscribe_token)
);

create index if not exists newsletter_subscribers_status_idx
  on public.newsletter_subscribers (status);
create index if not exists newsletter_subscribers_member_id_idx
  on public.newsletter_subscribers (member_id);

-- ---------------------------------------------------------------------------
-- newsletters (뉴스레터 콘텐츠, 블록 기반)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  subject text not null,
  preheader text,
  thumbnail_url text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED')),
  blocks jsonb not null default '[]',
  admin_id uuid references public.admin_profiles (id) on delete set null,
  view_count int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug)
);

create index if not exists newsletters_status_published_idx
  on public.newsletters (status, published_at);

drop trigger if exists newsletters_set_updated_at on public.newsletters;
create trigger newsletters_set_updated_at
  before update on public.newsletters
  for each row
  execute function public.set_updated_at();

-- Atomic view counter, called from lib/newsletter/queries.ts::recordNewsletterView
-- (avoids a read-then-write race under concurrent traffic).
create or replace function public.increment_newsletter_view_count(p_newsletter_id uuid)
returns void
language sql
as $$
  update public.newsletters set view_count = view_count + 1 where id = p_newsletter_id;
$$;

-- ---------------------------------------------------------------------------
-- newsletter_campaigns (발송 캠페인 / 스케줄)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  name text not null,

  send_type text not null
    check (send_type in ('IMMEDIATE', 'SCHEDULED', 'RECURRING', 'RANGE')),
  scheduled_at timestamptz,       -- SCHEDULED: 선택일 지정 발송
  recurring_time time,            -- RECURRING: 매일 발송 기준 시각 (KST, ex: 09:00)
  range_start date,               -- RANGE: 기간 발송 시작일
  range_end date,                 -- RANGE: 기간 발송 종료일
  last_sent_date date,            -- RECURRING/RANGE: 중복 발송 방지용 마지막 발송일

  target_tags text[] not null default '{}',
  target_all boolean not null default true,

  status text not null default 'SCHEDULED'
    check (status in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),
  sent_at timestamptz,

  total_recipients int not null default 0,
  total_sent int not null default 0,
  total_opened int not null default 0,
  total_clicked int not null default 0,
  total_bounced int not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists newsletter_campaigns_status_idx
  on public.newsletter_campaigns (status, scheduled_at);
create index if not exists newsletter_campaigns_newsletter_id_idx
  on public.newsletter_campaigns (newsletter_id);

-- ---------------------------------------------------------------------------
-- newsletter_deliveries (개별 발송 기록 - 통계의 원천)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns (id) on delete cascade,
  subscriber_id uuid references public.newsletter_subscribers (id) on delete set null,
  email text not null, -- 스냅샷: 구독자가 삭제/수신거부해도 통계 유지

  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED')),
  sent_at timestamptz,
  opened_at timestamptz,
  first_click_at timestamptz,
  click_count int not null default 0,
  bounced_at timestamptz,
  error_message text,

  tracking_token uuid not null default gen_random_uuid(),

  unique (campaign_id, subscriber_id),
  unique (tracking_token)
);

create index if not exists newsletter_deliveries_status_sent_idx
  on public.newsletter_deliveries (status, sent_at);

-- ---------------------------------------------------------------------------
-- newsletter_click_events (링크별 상세 클릭 통계)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_click_events (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references public.newsletter_deliveries (id) on delete cascade,
  url text not null,
  clicked_at timestamptz not null default now(),
  user_agent text,
  ip_hash text -- 개인정보 보호를 위해 해시만 저장
);

create index if not exists newsletter_click_events_delivery_idx
  on public.newsletter_click_events (delivery_id, clicked_at);

-- ---------------------------------------------------------------------------
-- newsletter_views (상세 페이지 조회 로그, 쿠키 기반 익명 방문자)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_views (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  visitor_id text,
  referrer text
);

create index if not exists newsletter_views_newsletter_idx
  on public.newsletter_views (newsletter_id, viewed_at);

-- ---------------------------------------------------------------------------
-- newsletter_ad_banners (광고 배너)
-- ---------------------------------------------------------------------------
create table if not exists public.newsletter_ad_banners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  link_url text not null,
  position text not null default 'MIDDLE'
    check (position in ('TOP', 'MIDDLE', 'BOTTOM', 'SIDEBAR')),
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  impressions int not null default 0,
  clicks int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists newsletter_ad_banners_active_idx
  on public.newsletter_ad_banners (is_active, start_date, end_date);

-- ---------------------------------------------------------------------------
-- storage bucket (배너/썸네일 이미지) - portfolio-images / board-images와 동일 패턴
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('newsletter-images', 'newsletter-images', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Same convention as 0001_init.sql: admin tables get a blanket "authenticated"
-- policy (admin session check happens in the app layer via lib/admin-auth.ts,
-- not via Supabase Auth roles); public-facing writes get a narrow anon policy.
-- Tracking/unsubscribe endpoints use the service-role client (bypasses RLS),
-- same as image uploads in lib/supabase/admin.ts.
-- ---------------------------------------------------------------------------
alter table public.newsletter_subscribers enable row level security;
alter table public.newsletters enable row level security;
alter table public.newsletter_campaigns enable row level security;
alter table public.newsletter_deliveries enable row level security;
alter table public.newsletter_click_events enable row level security;
alter table public.newsletter_views enable row level security;
alter table public.newsletter_ad_banners enable row level security;

drop policy if exists "Authenticated full access" on public.newsletter_subscribers;
create policy "Authenticated full access" on public.newsletter_subscribers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- /newsletter/subscribe submits here while signed out (mirrors consultations' public insert policy).
drop policy if exists "Public can subscribe" on public.newsletter_subscribers;
create policy "Public can subscribe" on public.newsletter_subscribers
  for insert to anon with check (true);

drop policy if exists "Authenticated full access" on public.newsletters;
create policy "Authenticated full access" on public.newsletters
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- /newsletter and /newsletter/[slug] read published newsletters while signed out.
drop policy if exists "Public can read published newsletters" on public.newsletters;
create policy "Public can read published newsletters" on public.newsletters
  for select to anon using (status = 'PUBLISHED');

drop policy if exists "Authenticated full access" on public.newsletter_campaigns;
create policy "Authenticated full access" on public.newsletter_campaigns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated full access" on public.newsletter_deliveries;
create policy "Authenticated full access" on public.newsletter_deliveries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated full access" on public.newsletter_click_events;
create policy "Authenticated full access" on public.newsletter_click_events
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated full access" on public.newsletter_views;
create policy "Authenticated full access" on public.newsletter_views
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "Authenticated full access" on public.newsletter_ad_banners;
create policy "Authenticated full access" on public.newsletter_ad_banners
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
