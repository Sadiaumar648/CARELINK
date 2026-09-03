-- CareLink location system, Phase 4: a real "on duty right now" hard
-- exclusion (Part 5) — a caregiver currently mid-session (bookings.status
-- = 'active') must never be eligible for a new request, independent of
-- whether the new request's requested time window happens to overlap
-- the active session's originally *scheduled* end time. Today's
-- checkAvailability() only catches the common case (a genuine window
-- overlap); a session running long past its stated end time slips
-- through. Closing that gap needs the actual status, which
-- caregiver_busy_times (20260827120000) doesn't expose today — only
-- the time range. This adds it.
--
-- CREATE OR REPLACE VIEW requires existing columns to stay in their
-- original position (a real bug hit earlier this session) — status is
-- appended at the end, not inserted before starts_at/ends_at.
-- Backward-compatible: every existing caller does `select("*")` and
-- only reads starts_at/ends_at, so the extra column is inert for them.

create or replace view public.caregiver_busy_times as
select staff_profile_id, starts_at, ends_at, status
from public.bookings
where status in ('accepted', 'paid', 'active');
