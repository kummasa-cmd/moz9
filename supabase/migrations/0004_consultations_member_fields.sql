-- Adds member-portal support to consultations (마이페이지 > 상담 신청 / 상담 내역).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- The consultations table originally only served the public /contact form
-- (name/email/phone based, no login). The mypage consultation feature links
-- a consultation to the logged-in member and lets admins leave a reply, but
-- those columns were never added to the database, causing inserts from
-- /mypage/consultations/new to fail with:
--   "Could not find the 'member_id' column of 'consultations' in the schema cache"

alter table public.consultations
  add column if not exists member_id uuid references auth.users(id) on delete set null;

alter table public.consultations
  add column if not exists admin_reply text;

create index if not exists consultations_member_id_idx
  on public.consultations (member_id);
