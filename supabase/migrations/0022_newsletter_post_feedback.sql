-- Per-post feedback (좋았어요/아쉬워요) for individual newsletter sections —
-- i.e. each block group imported from a board post via BoardPostPicker
-- (column/series/info/ad boards, "ad" included), keyed by ContentBlock's
-- sourcePostId. This is separate from newsletters.like_count/dislike_count
-- (0020_newsletter_board_integration.sql), which is the existing "이번
-- 뉴스레터 어땠어요" whole-newsletter feedback and stays unchanged.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

create table if not exists public.newsletter_post_feedback (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  source_post_id uuid not null,
  like_count int not null default 0,
  dislike_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (newsletter_id, source_post_id)
);

create index if not exists newsletter_post_feedback_newsletter_idx
  on public.newsletter_post_feedback (newsletter_id);

create or replace function public.increment_newsletter_post_feedback(
  p_newsletter_id uuid,
  p_source_post_id uuid,
  p_type text
)
returns void
language plpgsql
as $$
begin
  insert into public.newsletter_post_feedback (newsletter_id, source_post_id, like_count, dislike_count)
  values (
    p_newsletter_id,
    p_source_post_id,
    case when p_type = 'like' then 1 else 0 end,
    case when p_type = 'dislike' then 1 else 0 end
  )
  on conflict (newsletter_id, source_post_id) do update
  set like_count = public.newsletter_post_feedback.like_count
        + case when p_type = 'like' then 1 else 0 end,
      dislike_count = public.newsletter_post_feedback.dislike_count
        + case when p_type = 'dislike' then 1 else 0 end;
end;
$$;

alter table public.newsletter_post_feedback enable row level security;

drop policy if exists "Authenticated full access" on public.newsletter_post_feedback;
create policy "Authenticated full access" on public.newsletter_post_feedback
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
