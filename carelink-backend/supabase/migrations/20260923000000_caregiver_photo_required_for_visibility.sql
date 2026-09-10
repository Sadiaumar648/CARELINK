-- A profile photo is now required for a caregiver to be visible to
-- parents. public_caregivers is the single source for the Request a
-- Nanny pick-list, GET /api/search/caregivers, and GET
-- /api/caregivers/[id], so adding "photo_path is not null" here removes
-- a photo-less caregiver from all three at once — they reappear the
-- moment they upload one (POST /api/staff/photo, wired into caregiver
-- onboarding).
--
-- Full column list and every other predicate carried forward unchanged
-- from 20260919000000_caregiver_link_join_identity.sql (the most recent
-- version of this view).
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
  ) as areas,
  u.verification_method,
  sp.caregiver_type,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', cq.name,
          'institution', cq.institution,
          'year', cq.year,
          'verificationStatus', cq.verification_status
        )
      )
      from public.caregiver_qualifications cq
      where cq.staff_profile_id = sp.id
    ),
    '[]'::jsonb
  ) as qualifications,
  sp.dispatch_available
from public.staff_profiles sp
join public.users u on u.id = sp.user_id
where u.account_status = 'active'
  and sp.accepting_bookings = true
  and u.verification_status = 'verified'
  and sp.photo_path is not null
  and u.email not like '%@example.com'
  and u.email not like '%@carelink.invite'
  and u.email not like '%@carelink.seed';

grant select on public.public_caregivers to authenticated;
