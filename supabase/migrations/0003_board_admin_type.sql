-- Adds the "관리자" (admin-only) board type.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- Boards of this type are always created/updated with is_visible = false and
-- allow_user_write = false (enforced in app/admin/(protected)/site/board/actions.ts),
-- so they never surface on any public /community page and can only be
-- managed from the admin panel.

alter table public.boards drop constraint if exists boards_type_check;
alter table public.boards
  add constraint boards_type_check check (type in ('일반', '개인', '관리자'));
