-- Adds vendors (거래처) support for 결제관리 > 거래처목록.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  ceo_name text,
  phone text,
  email text,
  business_reg_no text,
  address text,
  homepage text,
  manager_member_id uuid references public.members(id) on delete set null,
  manager_name text,
  manager_phone text,
  manager_email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendors_manager_member_id_idx
  on public.vendors (manager_member_id);

alter table public.vendors enable row level security;

create policy "Authenticated full access" on public.vendors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
