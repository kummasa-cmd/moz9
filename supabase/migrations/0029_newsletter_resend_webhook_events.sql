-- Resend webhook → Supabase (4단계: webhook 이벤트 저장 + 역동기화 + Broadcast 통계).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query)
-- BEFORE deploying the matching code. The site subscribe form calls
-- newsletter_subscribe() (it falls back to the old path while the function
-- doesn't exist, so signups keep working either way), and the webhook route
-- writes newsletter_webhook_events / calls newsletter_apply_resend_opt_out()
-- once RESEND_WEBHOOK_SECRET is set.
--
-- Additive only: one new table, one new view, one new column with a default,
-- and four functions (the (re)subscribe and opt-out paths). No existing rows
-- are deleted or rewritten; newsletter_subscribers,
-- newsletter_campaigns, newsletter_deliveries and newsletter_click_events
-- (발송 이력, 오픈/클릭 데이터) are untouched. Safe to run more than once.
--
-- newsletter_subscribers.status already allows 'BOUNCED' (0005_newsletter.sql),
-- so permanent bounces need no status change here.

-- ---------------------------------------------------------------------------
-- newsletter_webhook_events: one row per Resend webhook delivery (svix-id)
-- ---------------------------------------------------------------------------
-- Privacy: no email address, name, IP or user agent is stored — only Resend's
-- own ids (email_id / broadcast id / contact id in metadata), the event type,
-- and for clicks the link without its query string. The raw payload is not kept.
create table if not exists public.newsletter_webhook_events (
  id uuid primary key default gen_random_uuid(),

  -- svix-id header. Resend keeps it across retries of the same event, so
  -- the unique constraint is the idempotency guard: a redelivered event is
  -- recognised and never applied (or counted) twice.
  svix_id text not null,
  event_type text not null,
  -- created_at from the payload (when Resend recorded the event).
  event_created_at timestamptz,
  received_at timestamptz not null default now(),

  --   PROCESSING  claimed by a request, not finished (or that request died)
  --   PROCESSED   applied — counts towards stats / subscriber changes
  --   IGNORED     valid but not ours to act on (transactional mail,
  --               unlinked broadcast, unknown type ...) — see outcome
  --   FAILED      transient error; Resend's retry re-claims it
  status text not null default 'PROCESSING'
    check (status in ('PROCESSING', 'PROCESSED', 'IGNORED', 'FAILED')),
  processing_started_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 1,
  -- Short machine-readable result, e.g. broadcast_stat,
  -- subscriber_unsubscribed, subscriber_not_found, not_newsletter.
  outcome text,
  error text,

  resend_broadcast_id text,
  email_id text,
  -- Resolved links (null when the event isn't a 검레터 Broadcast / subscriber).
  broadcast_send_id uuid references public.newsletter_broadcast_sends (id) on delete set null,
  subscriber_id uuid references public.newsletter_subscribers (id) on delete set null,

  -- Minimal extras: bounce {type, subType}, click {link}, contact_id.
  metadata jsonb not null default '{}',

  unique (svix_id)
);

-- Stats aggregation per Broadcast run.
create index if not exists newsletter_webhook_events_broadcast_idx
  on public.newsletter_webhook_events (broadcast_send_id, event_type)
  where broadcast_send_id is not null;

create index if not exists newsletter_webhook_events_status_idx
  on public.newsletter_webhook_events (status, received_at);

-- RLS on with no policies: only the service-role client (the webhook route)
-- touches this table.
alter table public.newsletter_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- newsletter_broadcast_stats: per-run numbers derived from the events
-- ---------------------------------------------------------------------------
-- Computed from PROCESSED events only, so a redelivered webhook can never
-- inflate a count. email_id is one recipient of one Broadcast, which gives
-- unique (distinct email_id) vs total (all events) opens and clicks without
-- storing any address.
-- security_invoker: the view runs with the caller's rights, so the
-- no-policy RLS on the tables above applies to it too.
create or replace view public.newsletter_broadcast_stats
with (security_invoker = true) as
select
  s.id as broadcast_send_id,
  s.campaign_id,
  s.run_key,
  s.resend_broadcast_id,
  s.recipient_estimate,
  count(distinct e.email_id) filter (where e.event_type = 'email.sent') as sent,
  count(distinct e.email_id) filter (where e.event_type = 'email.delivered') as delivered,
  count(distinct e.email_id) filter (where e.event_type = 'email.delivery_delayed') as delivery_delayed,
  count(distinct e.email_id) filter (where e.event_type = 'email.opened') as unique_opens,
  count(e.id) filter (where e.event_type = 'email.opened') as total_opens,
  count(distinct e.email_id) filter (where e.event_type = 'email.clicked') as unique_clicks,
  count(e.id) filter (where e.event_type = 'email.clicked') as total_clicks,
  count(distinct e.email_id) filter (where e.event_type = 'email.bounced') as bounced,
  count(distinct e.email_id) filter (
    where e.event_type = 'email.bounced' and lower(e.metadata ->> 'bounce_type') = 'permanent'
  ) as bounced_permanent,
  count(distinct e.email_id) filter (where e.event_type = 'email.complained') as complained,
  count(distinct e.email_id) filter (where e.event_type = 'email.failed') as failed,
  count(distinct e.email_id) filter (where e.event_type = 'email.suppressed') as suppressed
from public.newsletter_broadcast_sends s
left join public.newsletter_webhook_events e
  on e.broadcast_send_id = s.id
 and e.status = 'PROCESSED'
group by s.id;

-- ---------------------------------------------------------------------------
-- newsletter_suppressions.reason
-- ---------------------------------------------------------------------------
-- Why an address is on the do-not-contact list. Existing rows all came from
-- unsubscribes, hence the default. COMPLAINT / BOUNCE are written by the
-- webhook and are never downgraded back to UNSUBSCRIBE by it.
alter table public.newsletter_suppressions
  add column if not exists reason text not null default 'UNSUBSCRIBE';

alter table public.newsletter_suppressions
  drop constraint if exists newsletter_suppressions_reason_check;
alter table public.newsletter_suppressions
  add constraint newsletter_suppressions_reason_check
  check (reason in ('UNSUBSCRIBE', 'COMPLAINT', 'BOUNCE'));

-- ---------------------------------------------------------------------------
-- Subscriber status + suppression, changed atomically
-- ---------------------------------------------------------------------------
-- Both the site (re)subscribe and the webhook opt-out go through these
-- functions. Each one locks the subscriber row (select ... for update) and
-- changes newsletter_subscribers and newsletter_suppressions in the same
-- transaction, so the two can't interleave — e.g. a webhook adding a
-- suppression right after a re-subscribe removed it, which would leave a
-- SUBSCRIBED row that silently never gets mail.
--
-- Re-subscribe policy (newsletter_subscribe):
--   UNSUBSCRIBE suppression: an explicit site (re)subscribe lifts it.
--   COMPLAINT / BOUNCE suppression, or status BOUNCED: 'blocked' — nothing
--     changes (row, suppression, Resend Contact). Only an admin may lift
--     these (left for 5단계).
--
-- Opt-out policy (newsletter_apply_resend_opt_out):
--   UNSUBSCRIBE (Resend-side unsubscribe) is skipped as 'stale' when the event
--     is older than the subscriber's latest (re)subscribe — the newer
--     explicit consent wins.
--   COMPLAINT / BOUNCE always apply, whatever the timing: a re-subscribe must
--     never erase them.

-- UNSUBSCRIBE < BOUNCE < COMPLAINT
create or replace function public.newsletter_suppression_rank(p_reason text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_reason when 'COMPLAINT' then 2 when 'BOUNCE' then 1 else 0 end;
$$;

-- Adds the address, or upgrades its reason; never downgrades.
create or replace function public.newsletter_upsert_suppression(p_email text, p_reason text)
returns void
language sql
set search_path = ''
as $$
  insert into public.newsletter_suppressions as s (email, reason)
  values (p_email, p_reason)
  on conflict (email) do update
    set reason = excluded.reason
    where public.newsletter_suppression_rank(excluded.reason) > public.newsletter_suppression_rank(s.reason);
$$;

create or replace function public.newsletter_subscribe(
  p_email text,
  p_name text,
  p_member_id uuid,
  p_source text,
  p_tags text[]
)
returns table (result text, subscriber_id uuid, needs_contact_sync boolean)
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row record;
  v_found boolean;
  v_reason text;
  v_id uuid;
begin
  select s.id, s.status, s.resend_synced_at, s.resend_sync_error
    into v_row
    from public.newsletter_subscribers s
   where s.email = v_email
     for update;
  v_found := found;

  -- Read after taking the row lock, so a concurrent opt-out is either fully
  -- visible here or waits for this transaction.
  select sup.reason into v_reason from public.newsletter_suppressions sup where sup.email = v_email;

  if v_reason in ('COMPLAINT', 'BOUNCE') or (v_found and v_row.status = 'BOUNCED') then
    return query select 'blocked'::text, null::uuid, false;
    return;
  end if;

  if v_found then
    delete from public.newsletter_suppressions where email = v_email and reason = 'UNSUBSCRIBE';

    if v_row.status = 'SUBSCRIBED' then
      -- Already subscribed: only re-sync if the earlier sync never landed.
      return query select 'already'::text, v_row.id,
        (v_row.resend_synced_at is null or v_row.resend_sync_error is not null);
      return;
    end if;

    update public.newsletter_subscribers
       set status = 'SUBSCRIBED',
           subscribed_at = now(),
           unsubscribed_at = null,
           name = coalesce(nullif(p_name, ''), name),
           member_id = coalesce(p_member_id, member_id),
           resend_synced_at = null
     where id = v_row.id;
    return query select 'reactivated'::text, v_row.id, true;
    return;
  end if;

  insert into public.newsletter_subscribers (email, name, member_id, source, tags)
  values (v_email, nullif(p_name, ''), p_member_id, p_source, coalesce(p_tags, '{}'))
  on conflict (email) do nothing
  returning id into v_id;

  -- A concurrent submit inserted it first; that request owns the sync.
  if v_id is null then
    return query select 'already'::text, null::uuid, false;
    return;
  end if;

  delete from public.newsletter_suppressions where email = v_email and reason = 'UNSUBSCRIBE';
  return query select 'created'::text, v_id, true;
end;
$$;

create or replace function public.newsletter_apply_resend_opt_out(
  p_email text,
  p_status text,       -- UNSUBSCRIBED | BOUNCED
  p_reason text,       -- UNSUBSCRIBE | COMPLAINT | BOUNCE
  p_event_at timestamptz,
  p_contact_id text
)
returns table (outcome text, subscriber_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row record;
begin
  if p_status not in ('UNSUBSCRIBED', 'BOUNCED') or p_reason not in ('UNSUBSCRIBE', 'COMPLAINT', 'BOUNCE') then
    raise exception 'invalid opt-out % / %', p_status, p_reason;
  end if;

  select s.id, s.status, s.subscribed_at
    into v_row
    from public.newsletter_subscribers s
   where s.email = v_email
     for update;

  if not found then
    -- A Resend-side unsubscribe of an address we don't hold is only
    -- recorded; a complaint / hard bounce still keeps it off every list.
    if p_reason <> 'UNSUBSCRIBE' then
      perform public.newsletter_upsert_suppression(v_email, p_reason);
    end if;
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_row.status <> 'SUBSCRIBED' then
    perform public.newsletter_upsert_suppression(v_email, p_reason);
    return query select 'already'::text, v_row.id;
    return;
  end if;

  if p_reason = 'UNSUBSCRIBE' and p_event_at is not null and p_event_at < v_row.subscribed_at then
    return query select 'stale'::text, v_row.id;
    return;
  end if;

  update public.newsletter_subscribers
     set status = p_status,
         -- Same rule as the admin status change: only UNSUBSCRIBED sets it.
         unsubscribed_at = case when p_status = 'UNSUBSCRIBED' then now() else unsubscribed_at end,
         -- Resend-side unsubscribe: the Contact already says unsubscribed.
         -- Complaint / bounce: mark stale so the Contact sync pushes it.
         resend_synced_at = case when p_reason = 'UNSUBSCRIBE' then now() else null end,
         resend_sync_error = case when p_reason = 'UNSUBSCRIBE' then null else resend_sync_error end,
         resend_contact_id = coalesce(resend_contact_id, p_contact_id)
   where id = v_row.id;

  perform public.newsletter_upsert_suppression(v_email, p_reason);
  return query select 'updated'::text, v_row.id;
end;
$$;

-- Server-only: callable by the service-role client, never through the
-- public anon / authenticated API.
revoke all on function public.newsletter_suppression_rank(text) from public, anon, authenticated;
revoke all on function public.newsletter_upsert_suppression(text, text) from public, anon, authenticated;
revoke all on function public.newsletter_subscribe(text, text, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.newsletter_apply_resend_opt_out(text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.newsletter_suppression_rank(text) to service_role;
grant execute on function public.newsletter_upsert_suppression(text, text) to service_role;
grant execute on function public.newsletter_subscribe(text, text, uuid, text, text[]) to service_role;
grant execute on function public.newsletter_apply_resend_opt_out(text, text, text, timestamptz, text) to service_role;
