-- Newsletter issue number (발행호수): assigned only at the moment a newsletter
-- actually becomes visible to readers, matching the "실제 발행" rule already
-- used by lib/newsletter/queries.ts::filterOutUnsentScheduled — a newsletter
-- sitting in status=PUBLISHED while its email campaign is still an unsent
-- SCHEDULED/SENDING campaign ("임시 대기") does NOT get counted.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

create sequence if not exists public.newsletter_issue_number_seq start 1;

alter table public.newsletters
  add column if not exists issue_number int unique;

-- Assigns the next issue number the first time it's called for a given
-- newsletter; safe to call again later (returns the already-assigned number
-- without incrementing). Row lock prevents a double-assign on concurrent calls
-- for the same newsletter; the sequence itself guarantees no two newsletters
-- ever collide.
create or replace function public.assign_newsletter_issue_number(p_newsletter_id uuid)
returns int
language plpgsql
as $$
declare
  v_issue_number int;
begin
  select issue_number into v_issue_number
  from public.newsletters
  where id = p_newsletter_id
  for update;

  if v_issue_number is not null then
    return v_issue_number;
  end if;

  v_issue_number := nextval('public.newsletter_issue_number_seq');

  update public.newsletters
  set issue_number = v_issue_number
  where id = p_newsletter_id;

  return v_issue_number;
end;
$$;

-- Backfill: number newsletters that are already really published (visible per
-- the same rule as filterOutUnsentScheduled), oldest first.
with latest_campaign as (
  select distinct on (newsletter_id) newsletter_id, status, total_sent
  from public.newsletter_campaigns
  order by newsletter_id, created_at desc
),
visible as (
  select n.id, n.published_at
  from public.newsletters n
  left join latest_campaign lc on lc.newsletter_id = n.id
  where n.status = 'PUBLISHED'
    and n.published_at is not null
    and n.issue_number is null
    and not (lc.status in ('SCHEDULED', 'SENDING') and coalesce(lc.total_sent, 0) = 0)
),
numbered as (
  select id, row_number() over (order by published_at asc) as rn
  from visible
)
update public.newsletters n
set issue_number = numbered.rn
from numbered
where n.id = numbered.id;

select setval(
  'public.newsletter_issue_number_seq',
  coalesce((select max(issue_number) from public.newsletters), 0) + 1,
  false
);
