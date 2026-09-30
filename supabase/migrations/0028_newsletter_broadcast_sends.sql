-- Newsletter Resend Broadcast send path (3단계: Broadcast 발송 경로, 플래그 off).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query)
-- BEFORE setting NEWSLETTER_DELIVERY_MODE=broadcast anywhere. With the mode
-- left at legacy (the default) nothing reads or writes this table, so the
-- matching code can be deployed before or after this migration.
--
-- Additive only: a new table, nothing else. newsletter_campaigns,
-- newsletter_deliveries and newsletter_click_events (발송 이력, 오픈/클릭
-- 데이터) are untouched. Safe to run more than once.
--
-- Why a table rather than columns on newsletter_campaigns: RECURRING / RANGE
-- campaigns send once per day, so one campaign has many Broadcasts. Every
-- Broadcast id has to stay mapped to its campaign so the 4단계 webhook can
-- attribute email.* events (which carry broadcast_id) to the right run.
-- Which delivery mode a run used is also answered here: a campaign run with a
-- row in this table went out as a Broadcast; runs without one are legacy.

create table if not exists public.newsletter_broadcast_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.newsletter_campaigns (id) on delete cascade,
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,

  -- 'once' for IMMEDIATE / SCHEDULED campaigns, the KST date (YYYY-MM-DD) for
  -- RECURRING / RANGE. unique (campaign_id, run_key) is the duplicate-send
  -- guard: the row is inserted *before* any Resend call, so two overlapping
  -- runs can't both create a Broadcast.
  run_key text not null,
  segment_id text not null,

  -- Set as soon as Resend creates the draft (before it is sent).
  resend_broadcast_id text,

  -- Our side of the lifecycle:
  --   CREATING        row reserved, draft not (known to be) created yet
  --   DRAFT           draft exists in Resend, not sent
  --   SEND_REQUESTED  Resend accepted the send (or schedule) request
  --   FAILED          see last_error; reusable only if resend_broadcast_id is null
  status text not null default 'CREATING'
    check (status in ('CREATING', 'DRAFT', 'SEND_REQUESTED', 'FAILED')),
  -- Last status Resend reported (draft / queued / sent ...), filled in by 4단계.
  provider_status text,

  scheduled_at timestamptz,
  send_requested_at timestamptz,
  -- Supabase-side count of eligible subscribers when the run started. The
  -- real per-recipient numbers come from Resend (4단계 webhook).
  recipient_estimate int,
  last_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (campaign_id, run_key),
  unique (resend_broadcast_id)
);

create index if not exists newsletter_broadcast_sends_campaign_idx
  on public.newsletter_broadcast_sends (campaign_id, created_at desc);

drop trigger if exists newsletter_broadcast_sends_set_updated_at on public.newsletter_broadcast_sends;
create trigger newsletter_broadcast_sends_set_updated_at
  before update on public.newsletter_broadcast_sends
  for each row
  execute function public.set_updated_at();

-- RLS on with no policies: only the service-role client (send path,
-- scripts; bypasses RLS) touches this table, so the anon/authenticated keys
-- get no access at all. Add a policy in 4단계 only if an admin page needs to
-- read it with a non-service client.
alter table public.newsletter_broadcast_sends enable row level security;
