-- Enables per-board category selection for the column boards
-- (컬럼/연재/정보/광고), reusing the existing generic board-category CRUD at
-- /admin/site/board/[id]/categories (already scoped per board_id) so each of
-- the 4 boards gets its own independently managed category set. Members then
-- pick from the admin-added categories when writing (app/(site)/community/**).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

update public.boards set use_category = true where column_only = true;
