-- Newsletter test recipients: a separate list of addresses the admin can send
-- a newsletter to for checking, without touching newsletter_subscribers, the
-- Resend Contacts / Segment, campaigns, issue numbers or analytics.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor >
-- New query) BEFORE deploying the matching code: the subscribers page lists
-- this table and the editor's "테스트 계정" target reads it.
-- Safe to run more than once. Creates one table; no existing row is changed.
--
-- Test sends go out as plain (transactional) emails from the editor — see
-- lib/newsletter/test-send.ts — so nothing here is synced to Resend.

create table if not exists public.newsletter_test_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  memo text,
  -- Inactive rows stay listed but are skipped by test sends.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per address, case-insensitively.
create unique index if not exists newsletter_test_recipients_email_key
  on public.newsletter_test_recipients (lower(email));

-- Admin (service role) only, like the other newsletter tables: RLS on, no
-- policies, so anon / authenticated can't read or write it.
alter table public.newsletter_test_recipients enable row level security;
