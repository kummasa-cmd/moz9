-- Replaces the partner_posts binary 답변/미답변 status with a work-tracking
-- status: 작업요청 (requested) / 작업중 (in progress) / 작업완료 (completed) / 반려 (rejected).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).

alter table public.partner_posts
  drop constraint if exists partner_posts_status_check;

update public.partner_posts set status = '작업요청' where status = '미답변';
update public.partner_posts set status = '작업완료' where status = '답변완료';

alter table public.partner_posts
  alter column status set default '작업요청';

alter table public.partner_posts
  add constraint partner_posts_status_check
  check (status in ('작업요청', '작업중', '작업완료', '반려'));
