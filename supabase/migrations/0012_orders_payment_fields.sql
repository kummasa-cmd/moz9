-- Redesigns orders (결제관리) around vendor company, split payment amounts, and
-- contract dates, replacing the old ad-hoc order_no/customer/product/amount
-- fields with columns tied to the new 거래처(vendors) and 회원(members) search.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.orders drop constraint if exists orders_status_check;

alter table public.orders
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists company_name text,
  add column if not exists category text not null default '홈페이지',
  add column if not exists product_name text,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists paid_amount numeric not null default 0,
  add column if not exists refund_amount numeric not null default 0,
  add column if not exists paid_at date,
  add column if not exists manager_member_id uuid references public.members(id) on delete set null,
  add column if not exists manager_name text,
  add column if not exists manager_phone text,
  add column if not exists manager_email text,
  add column if not exists contract_start date,
  add column if not exists contract_end date,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

-- Backfill the new text fields from the legacy columns before dropping them.
update public.orders set company_name = customer where company_name is null;
update public.orders set product_name = product where product_name is null;

alter table public.orders
  drop column if exists order_no,
  drop column if exists customer,
  drop column if exists product,
  drop column if exists amount;

update public.orders set status = '입금대기'
  where status not in ('입금대기', '입금완료', '부분입금', '환불');

alter table public.orders alter column status set default '입금대기';

alter table public.orders
  add constraint orders_status_check check (status in ('입금대기', '입금완료', '부분입금', '환불')),
  add constraint orders_category_check check (category in ('홈페이지', '도메인', '부가서비스'));

create index if not exists orders_vendor_id_idx on public.orders (vendor_id);
create index if not exists orders_manager_member_id_idx on public.orders (manager_member_id);
