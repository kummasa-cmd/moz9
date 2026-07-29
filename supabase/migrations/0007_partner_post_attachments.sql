-- Adds rich-text content support and file attachments to the partner board.
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- partner_posts.content already stores text; from now on the mypage write form
-- saves HTML from the RichEditor into the same column, so no column change is
-- needed there. This migration only adds the attachment columns and the
-- storage bucket used to hold uploaded files.

alter table public.partner_posts
  add column if not exists attachment_url text;

alter table public.partner_posts
  add column if not exists attachment_name text;

-- Uploads happen server-side via the service-role client (lib/supabase/admin.ts),
-- which bypasses RLS, so no insert policy is needed. Public so the uploaded
-- files can be served directly via their public URL (unguessable UUID filenames).
insert into storage.buckets (id, name, public)
values ('member-files', 'member-files', true)
on conflict (id) do nothing;
