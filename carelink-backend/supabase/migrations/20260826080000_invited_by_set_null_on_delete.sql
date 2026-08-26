-- Fixes a second bug from migration 0001: users.invited_by had no ON
-- DELETE behavior, so it defaulted to RESTRICT — deleting an
-- administrator whose invited staff still referenced them as invited_by
-- failed at the database level ("Database error deleting user" from
-- Supabase Auth, since the auth.users cascade into public.users hit this
-- constraint). Caught by running the seed script twice in a row.
--
-- SET NULL is the right behavior here: invited_by is provenance, not a
-- relationship the record depends on to remain valid.

alter table public.users
  drop constraint users_invited_by_fkey;

alter table public.users
  add constraint users_invited_by_fkey
  foreign key (invited_by) references public.users (id) on delete set null;
