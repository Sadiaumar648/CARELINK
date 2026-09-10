-- "Request a Nanny" duration is now a number of DAYS, not a single
-- same-day block. A request (and the booking it becomes) covers
-- duration_days consecutive days, each a standard care day starting at
-- start_time. starts_at / ends_at keep describing day one's window — so
-- the generated duration_hours column, per-day earnings, and every
-- existing read stay meaningful — and duration_days says how many days
-- it runs. total_amount is the whole engagement (daily hours × rate ×
-- days × children), computed server-side.

alter table public.care_requests
  add column if not exists duration_days int not null default 1 check (duration_days between 1 and 7);
alter table public.bookings
  add column if not exists duration_days int not null default 1 check (duration_days between 1 and 7);

-- caregiver_busy_times, which the Request a Nanny pick-list's conflict
-- check reads, now reports a multi-day booking's busy range as
-- [starts_at, ends_at + (duration_days - 1) days] — the caregiver is
-- unavailable for the whole run. A VIEW may use the timezone-dependent
-- `+ interval` operator; an index/constraint expression cannot, which
-- is why bookings_no_overlap is deliberately NOT changed here — it
-- keeps guarding day one's window (still exactly right for an ordinary
-- single-day booking), and the fuller multi-day guard is this
-- busy-times check plus dispatch only ever offering one caregiver at a
-- time. Original view: 20260907000000_caregiver_busy_times_status.sql;
-- column order (staff_profile_id, starts_at, ends_at, status) preserved.
create or replace view public.caregiver_busy_times as
select
  staff_profile_id,
  starts_at,
  ends_at + ((duration_days - 1) * interval '1 day') as ends_at,
  status
from public.bookings
where status in ('accepted', 'paid', 'active');
