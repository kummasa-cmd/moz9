-- Links the newsletter module to the column/series/info/ad boards (0014_column_boards.sql):
-- - board_posts gets newsletter usage tracking (count + last used date)
-- - newsletters gets like/dislike feedback counters
-- - newsletter_templates stores reusable block layouts
-- - two RPCs for atomic increments, same pattern as increment_newsletter_view_count (0005_newsletter.sql)
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.board_posts
  add column if not exists newsletter_use_count int not null default 0,
  add column if not exists newsletter_last_used_at timestamptz;

alter table public.newsletters
  add column if not exists like_count int not null default 0,
  add column if not exists dislike_count int not null default 0;

create table if not exists public.newsletter_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  blocks jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists newsletter_templates_set_updated_at on public.newsletter_templates;
create trigger newsletter_templates_set_updated_at
  before update on public.newsletter_templates
  for each row
  execute function public.set_updated_at();

alter table public.newsletter_templates enable row level security;
drop policy if exists "Authenticated full access" on public.newsletter_templates;
create policy "Authenticated full access" on public.newsletter_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function public.increment_board_post_newsletter_usage(p_ids uuid[])
returns void
language sql
as $$
  update public.board_posts
  set newsletter_use_count = newsletter_use_count + 1,
      newsletter_last_used_at = now()
  where id = any(p_ids);
$$;

create or replace function public.increment_newsletter_feedback(p_newsletter_id uuid, p_type text)
returns void
language sql
as $$
  update public.newsletters
  set like_count = like_count + case when p_type = 'like' then 1 else 0 end,
      dislike_count = dislike_count + case when p_type = 'dislike' then 1 else 0 end
  where id = p_newsletter_id;
$$;
