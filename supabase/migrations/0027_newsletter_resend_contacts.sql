-- Newsletter Resend Contact sync (2단계: Resend Contact 동기화 기반 구축).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query)
-- BEFORE deploying the matching code — the subscribe / unsubscribe / admin
-- status paths write resend_synced_at, and lib/newsletter/contact-sync.ts
-- reads and writes all three columns below.
--
-- Additive only: no rows are deleted or rewritten, existing subscribers keep
-- their status, and newsletter_deliveries / newsletter_click_events
-- (발송 이력, 오픈/클릭 데이터) are untouched. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- newsletter_subscribers: Resend Contact sync bookkeeping
-- ---------------------------------------------------------------------------
-- resend_contact_id: id of the matching Resend Contact, once one is known.
-- resend_synced_at:  when Resend last matched this row's subscription state.
--   NULL means "not synced yet or changed since" — every status change resets
--   it, so NULL rows are exactly the ones the backfill / retry job picks up.
-- resend_sync_error: last sync failure message; cleared on the next success.
--   A failure never rolls back the Supabase status (the source of truth).
alter table public.newsletter_subscribers
  add column if not exists resend_contact_id text;
alter table public.newsletter_subscribers
  add column if not exists resend_synced_at timestamptz;
alter table public.newsletter_subscribers
  add column if not exists resend_sync_error text;

-- Retry / backfill scan: only rows that still need a sync.
create index if not exists newsletter_subscribers_resend_pending_idx
  on public.newsletter_subscribers (created_at, id)
  where resend_synced_at is null or resend_sync_error is not null;

-- ---------------------------------------------------------------------------
-- Drop the public anon insert policy
-- ---------------------------------------------------------------------------
-- Since 0026 (1단계) the site subscribe form goes through the server action
-- app/(site)/newsletter/subscribe/actions.ts, which writes with the
-- service-role client (bypasses RLS). Nothing inserts into this table with
-- the anon key any more, so the policy only widens the attack surface
-- (anyone holding the public anon key could insert rows directly).
-- "Authenticated full access" (admin pages) is left as is.
drop policy if exists "Public can subscribe" on public.newsletter_subscribers;
