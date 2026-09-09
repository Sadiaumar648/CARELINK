-- Follow-up to 20260920000000_preferred_caregiver.sql: one column that
-- migration was missing. preferred_dispatch_done alone can't tell "the
-- preferred attempt just concluded, pause here" apart from "the parent
-- already authorized moving on to normal search" — both look the same
-- (done = true) once the first offer has been resolved. This second
-- flag, set only by continuePreferredDispatch ("Find another
-- caregiver"), is what makes that distinction real.
alter table public.care_requests
  add column preferred_continue_authorized boolean not null default false;
