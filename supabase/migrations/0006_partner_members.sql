-- Adds partner (거래처) support to the member portal.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- 1. Extends members with admin-only partner fields (visibility/edit rights are
--    enforced in application code, not RLS: the admin edit page always shows
--    them, the mypage profile page only shows them when is_partner = true).
-- 2. Adds partner_posts / partner_post_comments for the partner-only 1:1 board
--    reachable from 마이페이지 > 거래처 게시판, with admin management under
--    /admin/consulting/partner.

alter table public.members
  add column if not exists is_partner boolean not null default false;

alter table public.members
  add column if not exists partner_name text;

alter table public.members
  add column if not exists partner_homepage text;

alter table public.members
  add column if not exists partner_address text;

alter table public.members
  add column if not exists partner_phone text;

alter table public.members
  add column if not exists partner_product_use boolean not null default false;

alter table public.members
  add column if not exists partner_contract_start date;

alter table public.members
  add column if not exists partner_contract_end date;

alter table public.members
  add column if not exists partner_note text;

alter table public.members
  add column if not exists partner_active boolean not null default false;

-- ---------------------------------------------------------------------------
-- partner_posts (마이페이지 > 거래처 게시판, /admin/consulting/partner)
-- ---------------------------------------------------------------------------
create table if not exists public.partner_posts (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default '미답변' check (status in ('미답변', '답변완료')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists partner_posts_member_id_idx
  on public.partner_posts (member_id);

-- ---------------------------------------------------------------------------
-- partner_post_comments (거래처 <-> 관리자 댓글 대화)
-- ---------------------------------------------------------------------------
create table if not exists public.partner_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.partner_posts(id) on delete cascade,
  author_name text not null,
  content text not null,
  is_admin boolean not null default false,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists partner_post_comments_post_id_idx
  on public.partner_post_comments (post_id);

alter table public.partner_posts enable row level security;
alter table public.partner_post_comments enable row level security;

create policy "Authenticated full access" on public.partner_posts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.partner_post_comments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
