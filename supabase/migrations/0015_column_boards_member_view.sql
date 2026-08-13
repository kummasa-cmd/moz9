-- Column boards (컬럼/연재/정보/광고) become viewable by any logged-in member;
-- write/edit/delete stays restricted to members flagged as 컬럼 회원.
-- Previously allow_user_write was false, which blocked writing entirely
-- regardless of column-member status. Turn it on here; app code in
-- app/(site)/community/**/*.tsx and lib/community-auth.ts enforces the
-- column_only + is_column_member gate on top of it.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

update public.boards
set allow_user_write = true
where column_only = true;
