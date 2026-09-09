-- Optional "preferred caregiver" on a care request: a parent can name
-- one specific caregiver to try first. Purely additive — every existing
-- care_requests row gets preferred_staff_profile_id = null and
-- preferred_dispatch_done = false, meaning dispatch.ts's existing
-- round-based search runs exactly as it always has for them.
--
-- preferred_dispatch_done tracks whether the one-shot preferred-
-- caregiver attempt has been resolved (offered-and-answered, or found
-- ineligible) — checked once, never retried automatically. The new
-- 'preferred_declined' dispatch_status is the paused state a request
-- sits in after that attempt fails, until the parent explicitly asks
-- CareLink to search normally (POST .../dispatch/continue) — dispatch
-- never auto-advances to another caregiver on its own in this state,
-- unlike every other decline/timeout in the existing sequential queue.
alter table public.care_requests
  add column preferred_staff_profile_id uuid references public.staff_profiles (id) on delete set null,
  add column preferred_dispatch_done boolean not null default false;

alter type public.care_request_dispatch_status add value 'preferred_declined';
