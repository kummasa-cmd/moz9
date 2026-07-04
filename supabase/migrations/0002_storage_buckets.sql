-- Storage buckets for uploaded images (portfolio thumbnails, board post images).
-- Run this once in the Supabase Dashboard SQL Editor (Project > SQL Editor > New query).
--
-- Uploads happen server-side via the service-role client (lib/supabase/admin.ts),
-- which bypasses RLS, so no insert policy is needed. Both buckets are public so
-- uploaded images can be served directly via their public URL.

insert into storage.buckets (id, name, public)
values ('portfolio-images', 'portfolio-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('board-images', 'board-images', true)
on conflict (id) do nothing;
