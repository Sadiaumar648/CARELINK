-- "Request a Nanny" duration is now a number of DAYS, not a single
-- same-day block. A request (and the booking it becomes) covers
-- duration_days consecutive days, each a standard care day starting at
-- start_time. starts_at / ends_at keep describing day one's window — so
-- the generated duration_hours column, per-day earnings, and every
-- existing read stay meaningful — and duration_days says how many days
-- it runs. total_amount is the whole engagement (daily hours × rate ×
-- days × children), computed server-side.

alter table public.care_requests
  add column duration_days int not null default 1 check (duration_days between 1 and 7);
alter table public.bookings
  add column duration_days int not null default 1 check (duration_days between 1 and 7);

-- A multi-day booking makes the caregiver unavailable for its whole
-- span, not just day one. The no-overlap constraint and
-- caregiver_busy_times (which the Request a Nanny pick-list's conflict
-- check reads) both now treat the busy range as
-- [starts_at, ends_at + (duration_days - 1) days]. For an ordinary
-- single-day booking (duration_days = 1) this is exactly today's range.
-- Original constraint: 20260827110000_bookings.sql.
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    staff_profile_id with =,
    tstzrange(starts_at, ends_at + ((duration_days - 1) * interval '1 day')) with &&
  )
  where (status in ('accepted', 'paid', 'active'));

-- Original view: 20260907000000_caregiver_busy_times_status.sql. Column
-- order preserved (staff_profile_id, starts_at, ends_at, status).
create or replace view public.caregiver_busy_times as
select
  staff_profile_id,
  starts_at,
  ends_at + ((duration_days - 1) * interval '1 day') as ends_at,
  status
from public.bookings
where status in ('accepted', 'paid', 'active');
