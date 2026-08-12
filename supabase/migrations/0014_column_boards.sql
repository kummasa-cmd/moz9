-- Adds a "컬럼 회원" member flag and a per-board "컬럼 회원 전용" access toggle,
-- then seeds the 4 new content boards (컬럼/연재/정보/광고) as column-member-only
-- boards. These use the exact same boards/board_posts schema as every other
-- 범용게시판 — the only difference is the column_only access gate, enforced in
-- app/(site)/community/**/*.tsx.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.members
  add column if not exists is_column_member boolean not null default false;

alter table public.boards
  add column if not exists column_only boolean not null default false;

insert into public.boards (id, name, slug, type, sort_order, is_visible, allow_user_write, use_category, use_comment, column_only)
values
  ('a1111111-0000-4000-8000-000000000001', '컬럼 게시판', 'column', '일반',
    (select coalesce(max(sort_order), 0) + 1 from public.boards), true, false, false, false, true),
  ('a1111111-0000-4000-8000-000000000002', '연재 게시판', 'series', '일반',
    (select coalesce(max(sort_order), 0) + 2 from public.boards), true, false, false, false, true),
  ('a1111111-0000-4000-8000-000000000003', '정보 게시판', 'info', '일반',
    (select coalesce(max(sort_order), 0) + 3 from public.boards), true, false, false, false, true),
  ('a1111111-0000-4000-8000-000000000004', '광고 게시판', 'ad', '일반',
    (select coalesce(max(sort_order), 0) + 4 from public.boards), true, false, false, false, true)
on conflict (id) do nothing;
