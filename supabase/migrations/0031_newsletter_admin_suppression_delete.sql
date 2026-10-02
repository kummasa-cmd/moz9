-- Promo admin "수신거부 해제" can no longer lift a protected suppression
-- (Stage 4.5 follow-up). Run this once in the Supabase Dashboard SQL Editor
-- (Project > SQL Editor > New query) AFTER 0030 and BEFORE deploying the
-- matching code: the promo targets page's delete actions call
-- newsletter_admin_delete_suppressions() and refuse to run without it.
-- Safe to run more than once. Adds one function; no row is changed here.
--
-- Until now those actions deleted newsletter_suppressions rows by id
-- directly, whatever the reason — so a COMPLAINT / BOUNCE /
-- PROVIDER_SUPPRESSED entry could be removed from the promo screen, after
-- which a complained (UNSUBSCRIBED) subscriber could re-subscribe on the
-- site and a bounced / suppressed address could sign up or receive promo
-- mail again.
--
-- Rule, per id, under the subscriber row lock (same lock order as the
-- 0029 / 0030 functions):
--   deleted    reason ranks as UNSUBSCRIBE (newsletter_suppression_rank = 0)
--              and the address's subscriber, if any, is not BOUNCED /
--              SUPPRESSED — the existing "lift an opt-out" behaviour,
--              unchanged for plain prospects
--   blocked    COMPLAINT / BOUNCE / PROVIDER_SUPPRESSED, or a BOUNCED /
--              SUPPRESSED subscriber: nothing changes. Lifting these needs a
--              separate, explicit operation (not built).
--   not_found  no such suppression row (already gone / stale form)
create or replace function public.newsletter_admin_delete_suppressions(p_ids uuid[])
returns table (deleted int, blocked int, not_found int)
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_email text;
  v_reason text;
  v_status text;
  v_deleted int := 0;
  v_blocked int := 0;
  v_missing int := 0;
begin
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    select sup.email into v_email from public.newsletter_suppressions sup where sup.id = v_id;
    if not found then
      v_missing := v_missing + 1;
      continue;
    end if;

    -- Subscriber row first (NULL when the address isn't a subscriber), then
    -- re-read the suppression: a concurrent webhook may have upgraded it.
    select s.status into v_status from public.newsletter_subscribers s where s.email = v_email for update;
    select sup.reason into v_reason from public.newsletter_suppressions sup where sup.id = v_id for update;
    if not found then
      v_missing := v_missing + 1;
      continue;
    end if;

    if public.newsletter_suppression_rank(v_reason) > public.newsletter_suppression_rank('UNSUBSCRIBE')
       or v_status in ('BOUNCED', 'SUPPRESSED') then
      v_blocked := v_blocked + 1;
      continue;
    end if;

    delete from public.newsletter_suppressions where id = v_id;
    v_deleted := v_deleted + 1;
  end loop;

  return query select v_deleted, v_blocked, v_missing;
end;
$$;

-- Server-only, like the 0029 / 0030 functions.
revoke all on function public.newsletter_admin_delete_suppressions(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_admin_delete_suppressions(uuid[]) to service_role;
