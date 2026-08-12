-- Fixes vendors.manager_member_id: the 거래처 등록 "관리자명" search picks a row
-- from public.members, whose id is a separate uuid from the auth user id, so the
-- original FK (referencing auth.users) rejected every insert with a foreign key
-- violation. Point it at public.members(id) instead.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.vendors
  drop constraint if exists vendors_manager_member_id_fkey;

alter table public.vendors
  add constraint vendors_manager_member_id_fkey
  foreign key (manager_member_id) references public.members(id) on delete set null;
