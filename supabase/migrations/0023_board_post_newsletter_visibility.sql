-- Column boards (컬럼/연재/정보/광고) visibility change: a post is visible only to its
-- author and admins until it has been featured in a newsletter, at which point it
-- becomes fully public. `newsletter_published` is the single flag that gates this —
-- it is set automatically when a post is included in a sent newsletter
-- (increment_board_post_newsletter_usage), and can also be toggled directly by an
-- admin from app/admin/(protected)/site/board/[id]/posts/[postId]/edit.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.board_posts
  add column if not exists newsletter_published boolean not null default false;

update public.board_posts
set newsletter_published = true
where newsletter_use_count > 0 and not newsletter_published;

create or replace function public.increment_board_post_newsletter_usage(p_ids uuid[])
returns void
language sql
as $$
  update public.board_posts
  set newsletter_use_count = newsletter_use_count + 1,
      newsletter_last_used_at = now(),
      newsletter_published = true
  where id = any(p_ids);
$$;
