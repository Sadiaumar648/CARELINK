-- Excludes integration-test-suite accounts from the parent-facing
-- caregiver search/profile surface. Every one of this project's Jest
-- integration tests (tests/*.test.ts) creates real auth users against
-- the live Supabase project and never deletes them — over many test
-- runs this left 134 "Booking Test Staff" / "Flow Test Staff" / "Pay
-- Test Staff" / etc. rows sitting in staff_profiles, all bookable
-- exactly like a real caregiver, all surfaced in Find Care.
--
-- Fixed at the view, not by deleting rows: staff_profiles itself, and
-- everything downstream of it, is untouched — this only changes what
-- public_caregivers (the sole source for GET /api/search/caregivers
-- and GET /api/caregivers/[id]) exposes to a parent. Admin's roster
-- still reads staff_profiles directly and is unaffected, so nothing
-- about test-data visibility for admin oversight changes.
--
-- The exclusion is by email domain/suffix, not name-string matching:
-- every test/seed account created by this project (the Jest suite's
-- own @example.com addresses, the real caregiver-invite flow's hidden
-- @carelink.invite placeholder, and scripts/seed.ts's @carelink.seed
-- fixtures) uses one of exactly these three, while every demo account
-- created for actual product walkthroughs uses @carelink.test — a
-- distinction already established, not invented for this migration.
create or replace view public.public_caregivers as
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
where u.account_status = 'active'
  and sp.accepting_bookings = true
  and u.email not like '%@example.com'
  and u.email not like '%@carelink.invite'
  and u.email not like '%@carelink.seed';

grant select on public.public_caregivers to authenticated;
