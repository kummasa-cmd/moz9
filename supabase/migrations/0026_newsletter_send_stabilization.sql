-- Newsletter send stabilization (1단계: 현재 resend.batch.send 경로 안정화).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query)
-- BEFORE deploying the matching code — lib/newsletter/scheduler.ts writes the
-- new PARTIAL status and the new columns below.
--
-- Additive only: no rows are deleted or rewritten, existing campaigns keep
-- their status / totals, and newsletter_deliveries / newsletter_click_events
-- (발송 이력, 오픈/클릭 데이터) are untouched. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- newsletter_campaigns.status: add PARTIAL (일부 수신자에게만 발송 성공)
-- ---------------------------------------------------------------------------
-- The original check was declared inline in 0005_newsletter.sql, so its name
-- is auto-generated. Drop whichever check constraint covers exactly the
-- status column instead of guessing the name.
do $$
declare
  v_constraint text;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
    where c.conrelid = 'public.newsletter_campaigns'::regclass
      and c.contype = 'c'
      and a.attname = 'status'
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table public.newsletter_campaigns drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.newsletter_campaigns
  add constraint newsletter_campaigns_status_check
  check (status in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'CANCELLED'));

-- ---------------------------------------------------------------------------
-- newsletter_campaigns: failure bookkeeping for the latest run
-- ---------------------------------------------------------------------------
-- total_failed: recipients of the latest run that were not accepted by Resend
--   (total_recipients = total_sent + total_failed for that run).
-- last_error: most recent send error message, for diagnosing FAILED/PARTIAL.
-- sending_started_at: when the current/last SENDING claim was taken — lets an
--   admin spot a run that crashed mid-send and is stuck in SENDING.
alter table public.newsletter_campaigns
  add column if not exists total_failed int not null default 0;
alter table public.newsletter_campaigns
  add column if not exists last_error text;
alter table public.newsletter_campaigns
  add column if not exists sending_started_at timestamptz;
