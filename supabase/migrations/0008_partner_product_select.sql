-- Replaces the partner "상품 이용여부" Y/N flag with a specific product choice.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.members
  add column if not exists partner_product text
  check (partner_product in ('LIGHT', 'BASIC', 'STANDARD', 'PREMIUM'));

alter table public.members
  drop column if exists partner_product_use;
