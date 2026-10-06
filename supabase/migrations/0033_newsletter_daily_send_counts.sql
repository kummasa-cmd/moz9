-- 0033: daily send counts for the admin analytics trend chart, aggregated in
-- the database.
--
-- The chart ("emails sent per day, last 30 days") used to fetch every legacy
-- delivery row and every Broadcast email.sent webhook event in the window
-- and bucket them in the app. PostgREST caps a select at max-rows (1000) and
-- silently drops the rest, so at ~108 subscribers x ~22 issues a month the
-- chart would undercount. This function returns one row per (day) for legacy
-- and per (Broadcast run, day) for Broadcast instead — O(days + runs), never
-- O(emails).
--
-- Same meaning as before (lib/newsletter/campaign-stats.ts):
--   legacy     newsletter_deliveries.sent_at, subscriber deliveries only
--              (prospect_id is null — promotional mail is excluded)
--   broadcast  PROCESSED email.sent events linked to a Broadcast run
--              (broadcast_send_id not null), one per distinct email_id,
--              timed by event_created_at, falling back to received_at
--   both       only on/after p_since; for Broadcast both received_at and the
--              event time must be on/after it (the old query filtered on
--              received_at, the app on the event time)
--   day        UTC calendar date — what the chart has always shown (it keyed
--              buckets by the ISO timestamp's first 10 characters)
--
-- Which runs count (B2 test campaigns, non-subscriber or unsent campaigns)
-- is still decided in the app with the same predicate as the rest of the
-- page (isAnalyticsCampaign), which is why Broadcast rows carry their
-- broadcast_send_id: the test-campaign rule is not duplicated in SQL.
--
-- Read-only (stable, a single SELECT). security invoker: it runs with the
-- caller's rights, so the no-policy RLS on these tables still applies; only
-- service_role (the admin page's client) may execute it.

create or replace function public.newsletter_daily_send_counts(p_since timestamptz)
returns table (source text, broadcast_send_id uuid, send_date date, sent_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    'legacy'::text,
    null::uuid,
    (d.sent_at at time zone 'UTC')::date,
    count(*)
  from public.newsletter_deliveries d
  where d.sent_at >= p_since
    and d.prospect_id is null
  group by (d.sent_at at time zone 'UTC')::date

  union all

  select
    'broadcast'::text,
    s.broadcast_send_id,
    (s.sent_at at time zone 'UTC')::date,
    count(*)
  from (
    -- One row per email: a webhook stored twice for the same email (distinct
    -- svix ids) is counted once, at its earliest time.
    select distinct on (e.email_id)
      e.email_id,
      e.broadcast_send_id,
      coalesce(e.event_created_at, e.received_at) as sent_at
    from public.newsletter_webhook_events e
    where e.event_type = 'email.sent'
      and e.status = 'PROCESSED'
      and e.broadcast_send_id is not null
      and e.email_id is not null
      and e.received_at >= p_since
      and coalesce(e.event_created_at, e.received_at) >= p_since
    order by e.email_id, coalesce(e.event_created_at, e.received_at), e.broadcast_send_id
  ) s
  group by s.broadcast_send_id, (s.sent_at at time zone 'UTC')::date
$$;

revoke all on function public.newsletter_daily_send_counts(timestamptz) from public, anon, authenticated;
grant execute on function public.newsletter_daily_send_counts(timestamptz) to service_role;
