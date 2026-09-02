-- CareLink caregiver dispatch: a sequential priority queue that offers a
-- care_requests row to one eligible caregiver at a time, expanding the
-- vicinity only once the local pool is exhausted. Deliberately additive
-- everywhere:
--
-- Every dispatch "offer" is a real bookings row (status 'pending') —
-- reusing the existing accept/decline routes, the existing
-- bookings_no_overlap exclusion constraint, and the existing
-- notify_on_booking_created / notify_on_booking_status_change triggers
-- untouched. A caregiver responding to a dispatch offer is the exact
-- same code path as responding to today's direct booking request.
--
-- bookings.status already supports 'pending' -> 'expired' as a legal
-- transition (enforce_booking_transition, 20260827110000) — nothing
-- needed there. This migration only adds two nullable columns to
-- bookings (null for every existing/future direct booking, zero
-- behaviour change for them) and a handful of columns to care_requests
-- (added in 20260903000000) tracking the coarse dispatch state.

alter table public.bookings
  add column care_request_id uuid references public.care_requests (id) on delete set null,
  add column offer_expires_at timestamptz;

create index bookings_care_request_idx on public.bookings (care_request_id);

create type public.care_request_dispatch_status as enum (
  'not_started',
  'searching',
  'expanding',
  'accepted',
  'exhausted',
  'cancelled'
);

alter table public.care_requests
  add column dispatch_status public.care_request_dispatch_status not null default 'not_started',
  add column vicinity_round smallint not null default 0 check (vicinity_round >= 0),
  add column response_window_seconds integer not null default 120 check (response_window_seconds > 0),
  add column dispatch_started_at timestamptz;
