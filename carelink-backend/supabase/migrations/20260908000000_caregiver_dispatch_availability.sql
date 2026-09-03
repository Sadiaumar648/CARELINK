-- CareLink location system, Phase 5: "Go Available" (Part 4) — a
-- caregiver's live dispatch eligibility and current GPS location,
-- deliberately separate from both:
--   * staff_profiles.accepting_bookings (existing) — a permanent on/off
--     that already gates ordinary search visibility; untouched, and NOT
--     what this toggle controls, so a caregiver who isn't live right
--     now still shows up normally when a parent browses caregivers.
--   * caregiver_locations (SafeTrack, 20260828000000) — booking-scoped,
--     only exists once a booking is already active; the wrong table for
--     a caregiver who wants to signal availability *before* any booking
--     exists.
--
-- dispatch_available starts false for every caregiver (including all
-- existing rows) — nobody is silently made dispatch-eligible by this
-- migration.
alter table public.staff_profiles
  add column dispatch_available boolean not null default false;

-- One row per caregiver, holding only the latest fix — same "no
-- location history" stance as SafeTrack. Locked down hard: RLS grants
-- the owner select/insert/update/delete on their own row, but there is
-- deliberately NO broad select grant to `authenticated` on this table,
-- unlike every other caregiver-facing view in this schema. Raw
-- coordinates are never meant to be readable by anyone but the
-- caregiver themselves — proximity matching (a later phase) reads them
-- through a SECURITY DEFINER function that returns a computed distance,
-- never the coordinates, never queryable directly by a parent's own
-- RLS-scoped client.
create table public.staff_dispatch_locations (
  staff_profile_id uuid primary key references public.staff_profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

alter table public.staff_dispatch_locations enable row level security;

create policy "staff_dispatch_locations_owner" on public.staff_dispatch_locations
  for all
  using (public.is_staff_profile_owner(staff_profile_id))
  with check (public.is_staff_profile_owner(staff_profile_id));

-- Non-sensitive: whether a caregiver's location fix is fresh enough to
-- use, without exposing what the fix actually is. Same reasoning as
-- caregiver_busy_times exposing a time range but not the booking
-- itself — lets a parent's own RLS-scoped client (running dispatch)
-- check staleness without needing elevated privilege.
create view public.caregiver_dispatch_freshness as
select staff_profile_id, updated_at
from public.staff_dispatch_locations;

grant select on public.caregiver_dispatch_freshness to authenticated;

-- dispatch_available appended at the very end, after every column the
-- two later migrations (20260901000000, 20260902000000) already added
-- — CREATE OR REPLACE VIEW requires every pre-existing column to keep
-- its exact name and position, so this carries the full current
-- definition forward rather than the original creation migration's
-- (which is what caused this migration's first run to fail: "cannot
-- drop columns from view"). Non-sensitive, same tier as
-- accepting_bookings already on this view.
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
  and u.email not like '%@example.com'
  and u.email not like '%@carelink.invite'
  and u.email not like '%@carelink.seed';

grant select on public.public_caregivers to authenticated;
