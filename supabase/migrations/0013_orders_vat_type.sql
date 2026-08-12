-- Adds VAT inclusion (부가세 여부) to 결제등록.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.orders
  add column if not exists vat_type text not null default '별도';

alter table public.orders
  add constraint orders_vat_type_check check (vat_type in ('포함', '별도'));
