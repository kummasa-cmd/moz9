-- Fixes for Supabase Security Advisor warnings (Security Advisor > Warnings, 2026-09-02):
-- 1. "Function Search Path Mutable" on 6 functions — none set search_path, so a role
--    that can create objects in a schema earlier in the caller's search_path could
--    shadow a table/function the definition relies on. All 6 already fully qualify
--    every reference with "public." (or use only pg_catalog builtins like now()),
--    so pinning search_path to '' is a pure hardening change with no behavior change.
-- 2. "RLS Policy Always True" on board_categories, board_comments, boards, consultations —
--    these tables' actual reads/writes all go through the service-role admin client
--    (see lib/supabase/admin.ts usage in every relevant app/**/actions.ts and page.tsx),
--    so the anon/authenticated INSERT/UPDATE/DELETE policies with USING/WITH CHECK (true)
--    are unused attack surface: anyone with the public anon key could otherwise write to
--    these tables directly via the PostgREST API, bypassing all app-level validation.
--    Dropping ALL existing policies per table (by querying pg_policies rather than
--    hardcoding names) and recreating only the minimal, actually-used set closes this
--    regardless of any undocumented policy drift already present on the live project.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- Not covered here: "Leaked Password Protection Disabled" is an Auth setting, not
-- schema — enable it in Dashboard > Authentication > Sign In / Providers > Password >
-- "Leaked password protection".

-- ---------------------------------------------------------------------------
-- 1. Function Search Path Mutable
-- ---------------------------------------------------------------------------
alter function public.set_updated_at() set search_path = '';
alter function public.increment_newsletter_feedback(uuid, text) set search_path = '';
alter function public.increment_newsletter_view_count(uuid) set search_path = '';
alter function public.assign_newsletter_issue_number(uuid) set search_path = '';
alter function public.increment_newsletter_post_feedback(uuid, uuid, text) set search_path = '';
alter function public.increment_board_post_newsletter_usage(uuid[]) set search_path = '';

-- ---------------------------------------------------------------------------
-- 2. RLS Policy Always True
-- ---------------------------------------------------------------------------

-- consultations: /contact submits via app/api/consultation/route.ts (service role),
-- mypage/admin read+write via createAdminClient() everywhere — no client ever needs
-- direct anon/authenticated access. Matches the existing orders/inquiries convention
-- (RLS enabled, zero policies = fully blocked to anon/authenticated).
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'consultations'
  loop
    execute format('drop policy if exists %I on public.consultations', pol.policyname);
  end loop;
end $$;

-- boards: public listing needs read access; all writes go through admin actions
-- (createAdminClient()), so no anon/authenticated write policy is needed.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'boards'
  loop
    execute format('drop policy if exists %I on public.boards', pol.policyname);
  end loop;
end $$;

create policy "boards_public_read" on public.boards
  for select to anon, authenticated using (is_visible = true);

-- board_categories: read-only from the client; all writes go through
-- app/admin/(protected)/site/board/[id]/categories/actions.ts (createAdminClient()).
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'board_categories'
  loop
    execute format('drop policy if exists %I on public.board_categories', pol.policyname);
  end loop;
end $$;

create policy "board_categories_public_read" on public.board_categories
  for select to anon, authenticated using (true);

-- board_comments: read-only from the client; addComment/deleteComment
-- (app/(site)/community/[slug]/[postId]/actions.ts) both use createAdminClient().
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'board_comments'
  loop
    execute format('drop policy if exists %I on public.board_comments', pol.policyname);
  end loop;
end $$;

create policy "board_comments_public_read" on public.board_comments
  for select to anon, authenticated using (true);

-- newsletter_subscribers: components/newsletter/SubscribeForm.tsx is the one place
-- that genuinely writes with the anon key from the browser, so this policy must stay,
-- but it's tightened from a bare (true) to match what the app actually sends
-- (source is always 'WEBSITE', email always present and shaped like an email —
-- same \S+@\S+ pattern the form itself validates against via react-hook-form).
drop policy if exists "Public can subscribe" on public.newsletter_subscribers;
create policy "Public can subscribe" on public.newsletter_subscribers
  for insert to anon
  with check (
    source = 'WEBSITE'
    and email ~* '^\S+@\S+$'
  );
