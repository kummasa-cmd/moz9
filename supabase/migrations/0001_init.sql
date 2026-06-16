-- moz9 admin schema
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- members (회원관리)
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  grade text not null default '일반' check (grade in ('일반', 'VIP')),
  status text not null default '정상' check (status in ('정상', '휴면', '탈퇴')),
  memo text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- portfolio_items (포트폴리오관리)
-- ---------------------------------------------------------------------------
create table if not exists public.portfolio_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default '홈페이지 제작',
  status text not null default '공개' check (status in ('공개', '비공개')),
  link text,
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- products (상품관리)
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default '패키지',
  setup_fee text,
  monthly_fee text,
  status text not null default '판매중' check (status in ('판매중', '숨김')),
  description text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders (주문관리)
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer text not null,
  product text not null,
  amount text not null,
  status text not null default '결제대기' check (status in ('결제대기', '결제완료', '진행중', '취소')),
  memo text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- consultations (상담관리 > 상담목록, /contact 폼 접수분)
-- ---------------------------------------------------------------------------
create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  subject text not null,
  message text,
  channel text not null default '무료상담 폼',
  status text not null default '미답변' check (status in ('미답변', '답변완료')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- inquiries (상담관리 > 1대1문의)
-- ---------------------------------------------------------------------------
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  member_name text not null,
  question text not null,
  answer text,
  status text not null default '미답변' check (status in ('미답변', '답변완료')),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

-- ---------------------------------------------------------------------------
-- board_posts (사이트관리 > 게시판관리) - 게시물 CRUD 대상
-- ---------------------------------------------------------------------------
create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  board text not null default '공지사항' check (board in ('공지사항', '자주 묻는 질문')),
  title text not null,
  content text not null,
  status text not null default '게시중' check (status in ('게시중', '숨김')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists board_posts_set_updated_at on public.board_posts;
create trigger board_posts_set_updated_at
  before update on public.board_posts
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- admin_profiles (사이트관리 > 관리자관리, auth.users 1:1 확장)
-- ---------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  role text not null default '운영자' check (role in ('운영자', '최고관리자')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- site_settings (사이트관리 > 메인관리, 단일 행)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  hero_title text,
  hero_subtitle text,
  cta_label text,
  cta_href text,
  company_name text,
  biz_number text,
  address text,
  ceo text,
  phone text,
  email text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, hero_title, hero_subtitle, cta_label, cta_href, company_name, biz_number, address, ceo, phone, email)
values (
  1,
  '작가의 디지털 파트너, 모즈나인',
  '책 쓴 사람, 작가, 전문직을 위한 디지털 콘텐츠 제작 및 운영 파트너',
  '무료상담 신청',
  '/contact',
  '모즈나인',
  '830-06-01678',
  '서울시 금천구 범안로 1130. 3층 302호 (가산동, 디지털 엠파이어 빌딩)',
  '홍성호',
  '010-6258-6933',
  'kummasa@naver.com'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- This is an internal admin tool with no public sign-up: any authenticated
-- (logged-in) user is an admin, so a single "authenticated" policy per table
-- is sufficient. Anonymous (anon key, no session) access is denied entirely.
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;
alter table public.portfolio_items enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.consultations enable row level security;
alter table public.inquiries enable row level security;
alter table public.board_posts enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.site_settings enable row level security;

create policy "Authenticated full access" on public.members
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.portfolio_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.products
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.orders
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.consultations
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
-- The public /contact page submits here while signed out, so anonymous
-- visitors need insert-only access (no read/update/delete).
create policy "Public can submit a consultation" on public.consultations
  for insert to anon with check (true);
create policy "Authenticated full access" on public.inquiries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.board_posts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.admin_profiles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "Authenticated full access" on public.site_settings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
