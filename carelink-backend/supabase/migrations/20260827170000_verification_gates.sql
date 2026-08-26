-- Task 3.3. Now that the verification workflow exists (3.2), the search
-- view can finally filter on it. Doing this in migration 0006 would have
-- made every caregiver unsearchable before Sprint 3 existed.

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
  and u.verification_status = 'verified';
