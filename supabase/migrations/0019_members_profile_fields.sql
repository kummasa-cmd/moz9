-- Adds profile photo, self-introduction, and personal homepage link to
-- 마이페이지 > 회원정보 수정. homepage is a separate field from the existing
-- partner_homepage (거래처 홈페이지 — the vendor's business site, shown only
-- to partner members); this one is the member's own personal link.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.members
  add column if not exists avatar_url text;

alter table public.members
  add column if not exists bio text;

alter table public.members
  add column if not exists homepage text;

-- Uploads happen server-side via the service-role client (lib/supabase/admin.ts),
-- which bypasses RLS, so no insert policy is needed. Public so avatars can be
-- served directly via their public URL (unguessable UUID filenames).
insert into storage.buckets (id, name, public)
values ('member-avatars', 'member-avatars', true)
on conflict (id) do nothing;
