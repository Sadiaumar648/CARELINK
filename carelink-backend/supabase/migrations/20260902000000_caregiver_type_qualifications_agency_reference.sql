-- Four additive, backward-compatible changes, all nullable/defaulted so
-- every existing row keeps working unchanged:
--
-- 1. staff_profiles.caregiver_type — structured nanny/babysitter, not
--    just free text in bio.
-- 2. caregiver_qualifications — a new one-to-many table (a caregiver can
--    have several), mirroring staff_skills/staff_areas exactly: same
--    ownership pattern, same admin-all policy, same "the frontend
--    replaces the whole set with PUT" shape.
-- 3. users.agency_reference_id — optional, unique when present (a
--    partial unique index, so multiple NULLs are still fine).
-- 4. users.verification_method — carelink vs agency, additive next to
--    the existing verification_status column, which keeps its exact
--    current values and meaning. Backfilled truthfully for rows that
--    are already verified: carelink when a real reviewed submission
--    exists, agency when it doesn't (this project's admin-onboarding
--    flow, added just before this migration, is the only other way an
--    account reaches "verified") — never guessed, always read from
--    what the data already shows.

-- ── 1. Caregiver type ───────────────────────────────────────────────────

create type public.caregiver_type as enum ('nanny', 'babysitter');

alter table public.staff_profiles
  add column caregiver_type public.caregiver_type;

-- ── 2. Qualifications ────────────────────────────────────────────────────

create table public.caregiver_qualifications (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  name text not null,
  institution text,
  year smallint check (year between 1950 and 2100),
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index caregiver_qualifications_staff_idx
  on public.caregiver_qualifications (staff_profile_id);

create trigger set_updated_at
  before update on public.caregiver_qualifications
  for each row execute function public.set_updated_at();

alter table public.caregiver_qualifications enable row level security;

create policy "caregiver_qualifications_owner" on public.caregiver_qualifications
  for all
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
  );

create policy "caregiver_qualifications_admin" on public.caregiver_qualifications
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Readable by anyone who can already see the caregiver publicly — same
-- pass-through-view pattern as staff_areas/staff_skills, not a new one.
grant select on public.caregiver_qualifications to authenticated;

-- ── 3. Agency reference ID ───────────────────────────────────────────────

alter table public.users
  add column agency_reference_id text;

create unique index users_agency_reference_id_unique
  on public.users (agency_reference_id)
  where agency_reference_id is not null;

-- ── 4. Verification method ───────────────────────────────────────────────

create type public.verification_method as enum ('carelink', 'agency');

alter table public.users
  add column verification_method public.verification_method;

update public.users u
set verification_method = 'carelink'
where u.verification_status = 'verified'
  and u.verification_method is null
  and exists (
    select 1 from public.verification_submissions vs
    where vs.user_id = u.id and vs.status = 'verified'
  );

update public.users u
set verification_method = 'agency'
where u.verification_status = 'verified'
  and u.verification_method is null;

-- The trigger that already keeps verification_status in sync with a
-- reviewed submission (migration 20260827160000) now also records that
-- this was a CareLink review — same trigger, same atomicity, no new
-- write path for anything that already calls it. Nothing changes for
-- the 'rejected' branch, or for the admin-onboarding "agency verified"
-- path, which sets verification_method = 'agency' itself directly (see
-- api/admin/staff and api/admin/parents).
create or replace function public.sync_verification_status_on_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('verified', 'rejected') and new.status is distinct from old.status then
    update public.users
    set
      verification_status = new.status,
      verification_method = case when new.status = 'verified' then 'carelink' else verification_method end
    where id = new.user_id;
  end if;
  return new;
end;
$$;

-- ── Extend the public caregiver search/profile view ──────────────────────
-- Re-created in full (Postgres requires the whole column list on
-- CREATE OR REPLACE VIEW) — carries forward the test-account exclusion
-- from migration 20260901000000 unchanged, and adds caregiver_type plus
-- a qualifications array using the exact same jsonb_agg pass-through
-- pattern the view already uses for skills and areas.
create or replace view public.public_caregivers as
select
  sp.id as staff_profile_id,
  sp.user_id,
  u.full_name,
  u.verification_status,
  u.verification_method,
  sp.photo_path,
  sp.bio,
  sp.caregiver_type,
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
  ) as qualifications
from public.staff_profiles sp
join public.users u on u.id = sp.user_id
where u.account_status = 'active'
  and sp.accepting_bookings = true
  and u.email not like '%@example.com'
  and u.email not like '%@carelink.invite'
  and u.email not like '%@carelink.seed';

grant select on public.public_caregivers to authenticated;
