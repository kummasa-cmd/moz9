-- Resend account suppression ↔ Supabase (Stage 4.5: suppression 정합성 강화).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query)
-- BEFORE deploying the matching code: the admin status change calls
-- newsletter_admin_set_status() and refuses to run without it, and the
-- reconciliation (contact-sync cron / webhook / scripts/newsletter/
-- reconcile-resend-suppressions.ts) calls newsletter_apply_provider_suppression().
-- Requires 0029. Safe to run more than once.
--
-- Additive only: one status value, one reason value, six nullable columns,
-- two new functions, and three functions re-created with stricter rules. No
-- row is updated or deleted here — existing subscribers keep their status
-- and existing suppressions keep their reason (the new columns start NULL).
--
-- Why a new status: Resend skips every address on the account suppression
-- list ("email.suppressed"), so a subscriber on it can't receive anything
-- while still counting as SUBSCRIBED. When the cause is confirmed it maps to
-- the existing states (permanent bounce → BOUNCED, complaint → UNSUBSCRIBED).
-- When it isn't (manual entry, non-permanent / unknown bounce type, lookup
-- failure) we must not claim BOUNCED, yet the row has to leave SUBSCRIBED:
-- a SUBSCRIBED row whose Contact we push as unsubscribed would be flipped to
-- UNSUBSCRIBED by the echoed contact.updated webhook, losing the cause.
--   SUPPRESSED  Resend refuses to deliver; cause not confirmed as a bounce or
--               complaint. Not a recipient, no site re-subscribe.

-- ---------------------------------------------------------------------------
-- newsletter_subscribers.status: + SUPPRESSED
-- ---------------------------------------------------------------------------
-- The 0005 check constraint is unnamed (auto-named) — drop whichever
-- single-column check sits on status, then add the named replacement.
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
    where c.conrelid = 'public.newsletter_subscribers'::regclass
      and c.contype = 'c'
      and a.attname = 'status'
      and array_length(c.conkey, 1) = 1
  loop
    execute format('alter table public.newsletter_subscribers drop constraint %I', v_constraint);
  end loop;
end $$;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_status_check
  check (status in ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED', 'SUPPRESSED'));

-- ---------------------------------------------------------------------------
-- newsletter_suppressions: + PROVIDER_SUPPRESSED, provider metadata
-- ---------------------------------------------------------------------------
-- Provider metadata is what Resend told us — ids and classification only,
-- never message text:
--   provider_origin          suppression origin: bounce | complaint | manual
--   provider_suppression_id  Resend suppression id
--   source_email_id          Resend email id that triggered it (bounce / complaint)
--   bounce_type / _sub_type  from that email (Permanent / Transient / ...)
--   verified_at              when the classification was confirmed from Resend
--                            data; NULL = fail-closed default, re-checked by
--                            the reconciliation
alter table public.newsletter_suppressions add column if not exists provider_origin text;
alter table public.newsletter_suppressions add column if not exists provider_suppression_id text;
alter table public.newsletter_suppressions add column if not exists source_email_id text;
alter table public.newsletter_suppressions add column if not exists bounce_type text;
alter table public.newsletter_suppressions add column if not exists bounce_sub_type text;
alter table public.newsletter_suppressions add column if not exists verified_at timestamptz;

alter table public.newsletter_suppressions
  drop constraint if exists newsletter_suppressions_reason_check;
alter table public.newsletter_suppressions
  add constraint newsletter_suppressions_reason_check
  check (reason in ('UNSUBSCRIBE', 'PROVIDER_SUPPRESSED', 'BOUNCE', 'COMPLAINT'));

alter table public.newsletter_suppressions
  drop constraint if exists newsletter_suppressions_provider_origin_check;
alter table public.newsletter_suppressions
  add constraint newsletter_suppressions_provider_origin_check
  check (provider_origin is null or provider_origin in ('bounce', 'complaint', 'manual'));

-- ---------------------------------------------------------------------------
-- Suppression precedence
-- ---------------------------------------------------------------------------
-- UNSUBSCRIBE < PROVIDER_SUPPRESSED < BOUNCE < COMPLAINT. The relative order
-- of the 0029 reasons is unchanged; newsletter_upsert_suppression (0029)
-- keeps using this and still never downgrades.
create or replace function public.newsletter_suppression_rank(p_reason text)
returns int
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'COMPLAINT' then 3
    when 'BOUNCE' then 2
    when 'PROVIDER_SUPPRESSED' then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- newsletter_subscribe: also blocked by PROVIDER_SUPPRESSED / SUPPRESSED
-- ---------------------------------------------------------------------------
-- Same as 0029 except the blocked set. Resend would skip the address anyway,
-- so a site (re)subscribe must not make it look like a recipient again.
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

  if v_reason in ('COMPLAINT', 'BOUNCE', 'PROVIDER_SUPPRESSED')
     or (v_found and v_row.status in ('BOUNCED', 'SUPPRESSED')) then
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

-- ---------------------------------------------------------------------------
-- newsletter_apply_resend_opt_out: SUPPRESSED rows upgrade on a confirmed cause
-- ---------------------------------------------------------------------------
-- Same as 0029, plus: a SUPPRESSED row that now gets a confirmed complaint /
-- permanent bounce moves to UNSUBSCRIBED / BOUNCED. A Resend-side unsubscribe
-- (including the echo of our own Contact push) never changes a non-SUBSCRIBED
-- row's status, and the suppression reason is never downgraded.
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

  if v_row.status = 'SUPPRESSED' and p_reason in ('COMPLAINT', 'BOUNCE') then
    update public.newsletter_subscribers
       set status = p_status,
           unsubscribed_at = case when p_status = 'UNSUBSCRIBED' then now() else unsubscribed_at end,
           resend_contact_id = coalesce(resend_contact_id, p_contact_id)
     where id = v_row.id;
    perform public.newsletter_upsert_suppression(v_email, p_reason);
    return query select 'updated'::text, v_row.id;
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

-- ---------------------------------------------------------------------------
-- newsletter_apply_provider_suppression: Resend account suppression → Supabase
-- ---------------------------------------------------------------------------
-- Called by the reconciliation (cron / script) and the webhook
-- (email.suppressed, suppression.added) with the classification made from
-- Resend data (lib/newsletter/resend-suppressions.ts):
--   COMPLAINT            origin=complaint
--   BOUNCE               origin=bounce and the source email's bounce.type is Permanent
--   PROVIDER_SUPPRESSED  anything else (manual, other / missing bounce type,
--                        lookup failure) — fail-closed, never claimed as BOUNCE
--
-- Under the subscriber row lock:
--   - the suppression is added, or its reason upgraded (never downgraded);
--     provider metadata is refreshed (NULL inputs keep what's stored)
--   - the status follows the strongest reason now stored:
--       COMPLAINT → UNSUBSCRIBED, BOUNCE → BOUNCED, PROVIDER_SUPPRESSED → SUPPRESSED
--     but only a SUBSCRIBED row moves, or a SUPPRESSED row whose cause is
--     now confirmed. UNSUBSCRIBED / BOUNCED rows keep their status (the
--     suppression alone keeps them out).
--   - no stale-event check: the address is undeliverable whatever the
--     timing, even if it subscribed after Resend suppressed it
--   - a moved row is marked for a Contact sync (resend_synced_at = NULL)
-- Addresses with no subscriber row (e.g. promo prospects) are left alone:
-- 'not_found', nothing written.
--
-- Outcomes: updated | already | not_found
create or replace function public.newsletter_apply_provider_suppression(
  p_email text,
  p_reason text,                   -- PROVIDER_SUPPRESSED | BOUNCE | COMPLAINT
  p_provider_origin text,          -- bounce | complaint | manual | NULL
  p_provider_suppression_id text,
  p_source_email_id text,
  p_bounce_type text,
  p_bounce_sub_type text,
  p_verified boolean
)
returns table (outcome text, subscriber_id uuid, previous_status text, new_status text, effective_reason text)
language plpgsql
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_row record;
  v_reason text;
  v_target text;
begin
  if p_reason not in ('PROVIDER_SUPPRESSED', 'BOUNCE', 'COMPLAINT') then
    raise exception 'invalid provider suppression reason %', p_reason;
  end if;
  if p_provider_origin is not null and p_provider_origin not in ('bounce', 'complaint', 'manual') then
    raise exception 'invalid provider origin %', p_provider_origin;
  end if;

  select s.id, s.status
    into v_row
    from public.newsletter_subscribers s
   where s.email = v_email
     for update;

  if not found then
    return query select 'not_found'::text, null::uuid, null::text, null::text, null::text;
    return;
  end if;

  insert into public.newsletter_suppressions as s (
    email, reason, provider_origin, provider_suppression_id, source_email_id,
    bounce_type, bounce_sub_type, verified_at
  )
  values (
    v_email, p_reason, p_provider_origin, p_provider_suppression_id, p_source_email_id,
    p_bounce_type, p_bounce_sub_type, case when p_verified then now() end
  )
  on conflict (email) do update
    set reason = case
          when public.newsletter_suppression_rank(excluded.reason) > public.newsletter_suppression_rank(s.reason)
            then excluded.reason
          else s.reason
        end,
        provider_origin = coalesce(excluded.provider_origin, s.provider_origin),
        provider_suppression_id = coalesce(excluded.provider_suppression_id, s.provider_suppression_id),
        source_email_id = coalesce(excluded.source_email_id, s.source_email_id),
        bounce_type = coalesce(excluded.bounce_type, s.bounce_type),
        bounce_sub_type = coalesce(excluded.bounce_sub_type, s.bounce_sub_type),
        verified_at = coalesce(excluded.verified_at, s.verified_at);

  select sup.reason into v_reason from public.newsletter_suppressions sup where sup.email = v_email;
  v_target := case v_reason
    when 'COMPLAINT' then 'UNSUBSCRIBED'
    when 'BOUNCE' then 'BOUNCED'
    else 'SUPPRESSED'
  end;

  if v_row.status = 'SUBSCRIBED'
     or (v_row.status = 'SUPPRESSED' and v_target in ('UNSUBSCRIBED', 'BOUNCED')) then
    update public.newsletter_subscribers
       set status = v_target,
           unsubscribed_at = case when v_target = 'UNSUBSCRIBED' then now() else unsubscribed_at end,
           resend_synced_at = null
     where id = v_row.id;
    return query select 'updated'::text, v_row.id, v_row.status::text, v_target, v_reason;
    return;
  end if;

  return query select 'already'::text, v_row.id, v_row.status::text, v_row.status::text, v_reason;
end;
$$;

-- ---------------------------------------------------------------------------
-- newsletter_admin_set_status: the admin list's status change
-- ---------------------------------------------------------------------------
-- Replaces the unconditional "SUBSCRIBED → delete the suppression" of the
-- admin action. A protected row — strong suppression (COMPLAINT / BOUNCE /
-- PROVIDER_SUPPRESSED) or status BOUNCED / SUPPRESSED — can't be changed
-- here at all: lifting one needs a separate, explicit admin operation (not
-- built yet), and the Resend account suppression has to be dealt with too.
-- Unprotected rows behave as before:
--   SUBSCRIBED   lifts an UNSUBSCRIBE suppression (same as a site re-subscribe)
--   UNSUBSCRIBED adds an UNSUBSCRIBE suppression
--   BOUNCED      adds a BOUNCE suppression
-- Every change marks the Contact for a sync.
--
-- Outcomes: updated | unchanged | blocked | not_found
create or replace function public.newsletter_admin_set_status(p_subscriber_id uuid, p_status text)
returns table (outcome text, subscriber_id uuid)
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_reason text;
begin
  if p_status not in ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED') then
    raise exception 'invalid admin status %', p_status;
  end if;

  select s.id, s.email, s.status
    into v_row
    from public.newsletter_subscribers s
   where s.id = p_subscriber_id
     for update;

  if not found then
    return query select 'not_found'::text, null::uuid;
    return;
  end if;

  if v_row.status = p_status then
    return query select 'unchanged'::text, v_row.id;
    return;
  end if;

  select sup.reason into v_reason from public.newsletter_suppressions sup where sup.email = v_row.email;

  if v_reason in ('COMPLAINT', 'BOUNCE', 'PROVIDER_SUPPRESSED') or v_row.status in ('BOUNCED', 'SUPPRESSED') then
    return query select 'blocked'::text, v_row.id;
    return;
  end if;

  update public.newsletter_subscribers
     set status = p_status,
         unsubscribed_at = case
           when p_status = 'UNSUBSCRIBED' then now()
           when p_status = 'SUBSCRIBED' then null
           else unsubscribed_at
         end,
         resend_synced_at = null
   where id = v_row.id;

  if p_status = 'SUBSCRIBED' then
    delete from public.newsletter_suppressions where email = v_row.email and reason = 'UNSUBSCRIBE';
  elsif p_status = 'UNSUBSCRIBED' then
    perform public.newsletter_upsert_suppression(v_row.email, 'UNSUBSCRIBE');
  else
    perform public.newsletter_upsert_suppression(v_row.email, 'BOUNCE');
  end if;

  return query select 'updated'::text, v_row.id;
end;
$$;

-- Server-only, like the 0029 functions.
revoke all on function public.newsletter_suppression_rank(text) from public, anon, authenticated;
revoke all on function public.newsletter_subscribe(text, text, uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.newsletter_apply_resend_opt_out(text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.newsletter_apply_provider_suppression(text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.newsletter_admin_set_status(uuid, text) from public, anon, authenticated;
grant execute on function public.newsletter_suppression_rank(text) to service_role;
grant execute on function public.newsletter_subscribe(text, text, uuid, text, text[]) to service_role;
grant execute on function public.newsletter_apply_resend_opt_out(text, text, text, timestamptz, text) to service_role;
grant execute on function public.newsletter_apply_provider_suppression(text, text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.newsletter_admin_set_status(uuid, text) to service_role;
