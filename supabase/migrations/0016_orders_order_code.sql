-- Adds a payment reference code to orders (결제관리), generated at
-- registration time as: 등록일(YYYYMMDD, Asia/Seoul) + 6자리 랜덤 영숫자 +
-- 4자리 일련번호(당일 0001부터 시작, 자정 지나면 다시 0001부터). Surfaced as
-- 결제번호 in 마이페이지 > 결제 내역 상세보기 and the admin 결제수정 page.
-- Application code generates this for new rows (lib/order-code.ts); this
-- migration backfills existing rows following the same rule.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.orders add column if not exists order_code text;

create or replace function pg_temp.random_alnum6() returns text as $$
  select string_agg(
    substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (floor(random() * 36) + 1)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$ language sql volatile;

with numbered as (
  select
    id,
    to_char(created_at at time zone 'Asia/Seoul', 'YYYYMMDD') as day_key,
    row_number() over (
      partition by to_char(created_at at time zone 'Asia/Seoul', 'YYYYMMDD')
      order by created_at asc, id asc
    ) as seq
  from public.orders
  where order_code is null
)
update public.orders o
set order_code = n.day_key || pg_temp.random_alnum6() || lpad(n.seq::text, 4, '0')
from numbered n
where o.id = n.id;

alter table public.orders alter column order_code set not null;
alter table public.orders add constraint orders_order_code_key unique (order_code);
