-- Enables tasks 2.6-2.9: search needs to read staff data broadly, but
-- the base tables' RLS only allows the owner and an administrator to
-- read a staff_profiles row directly. Mirrors doc 5 (Backend Schema) §6
-- — "the only path by which one user reads another's data" is a view,
-- never a direct grant on the base table. Views here are owned by the
-- migration role, which owns the underlying tables and so bypasses their
-- RLS; the explicit grants below are what actually authorises reads.
--
-- Not filtered on verification_status yet — that gate is task 3.3, once
-- the verification workflow exists. Filtering on it now would make every
-- caregiver unsearchable until Sprint 3.

create view public.public_caregivers as
select
  sp.id as staff_profile_id,
  sp.user_id,
  u.full_name,
  u.verification_status,
  sp.photo_path,
  sp.bio,
  sp.years_experience,
  sp.hourly_rate,
  sp.languages,
  sp.rating_avg,
  sp.rating_count,
  sp.bookings_completed,
  sp.accepting_bookings,
  coalesce(
    (select array_agg(ss.skill) from public.staff_skills ss where ss.staff_profile_id = sp.id),
    '{}'
  ) as skills,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('area', sa.area, 'isPrimary', sa.is_primary))
      from public.staff_areas sa
      where sa.staff_profile_id = sp.id
    ),
    '[]'::jsonb
  ) as areas
from public.staff_profiles sp
join public.users u on u.id = sp.user_id
where u.account_status = 'active' and sp.accepting_bookings = true;

grant select on public.public_caregivers to authenticated;

-- Declared availability isn't sensitive, but it lives on tables an
-- unrelated parent can't read directly — same pass-through pattern.

create view public.caregiver_availability_windows as
select staff_profile_id, weekday, part, start_time, end_time
from public.availability_windows;

grant select on public.caregiver_availability_windows to authenticated;

create view public.caregiver_availability_exceptions as
select staff_profile_id, on_date, unavailable
from public.availability_exceptions;

grant select on public.caregiver_availability_exceptions to authenticated;

-- What a caregiver is already committed to. Only the time range, not who
-- with or why — knowing someone is busy 2-6pm isn't private; the booking
-- record behind it is.

create view public.caregiver_busy_times as
select staff_profile_id, starts_at, ends_at
from public.bookings
where status in ('accepted', 'paid', 'active');

grant select on public.caregiver_busy_times to authenticated;
