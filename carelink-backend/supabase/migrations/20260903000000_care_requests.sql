-- CareLink AI conversational care-request discovery. Adds exactly one
-- new table, care_requests — a structured record of what a parent asked
-- for (via the AI assistant or the direct Nanny/Babysitter form) and
-- confirmed, before it's ever turned into a search. It is never queried
-- by the matching engine and never duplicates search logic: after a
-- parent confirms, the frontend still calls the existing
-- GET /api/search/caregivers with the same filter shape the direct
-- request flow already produces — this table only makes that intent a
-- real, storable row instead of a query string, and lets the location
-- rule be enforced with a real NOT NULL column rather than trusting the
-- frontend alone.
--
-- RLS is mirrored exactly off caregiver_qualifications (20260902000000):
-- an owner-via-profile policy plus an admin-all policy, same shape, same
-- current_user_role() check. caregiver_type and skill_tag are the exact
-- enums already used by staff_profiles/staff_skills — nothing new
-- invented there.

create type public.care_request_source as enum ('ai', 'direct');

create table public.care_requests (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.parent_profiles (id) on delete cascade,
  ward_id uuid references public.wards (id) on delete set null,
  source public.care_request_source not null,
  caregiver_type public.caregiver_type not null,
  date date not null,
  start_time time not null,
  end_time time not null check (end_time > start_time),
  -- The enforced rule: a care request cannot exist without a real
  -- location, independent of anything the AI assistant computed.
  location text not null check (length(trim(location)) > 0),
  skills public.skill_tag[] not null default '{}',
  notes text,
  -- Only ever set for source = 'ai' — the assistant's own advisory
  -- suggestion and its one-sentence reason, kept for transparency and
  -- never treated as a decision (the parent's own caregiver_type above
  -- is what's actually used).
  ai_recommendation public.caregiver_type,
  ai_recommendation_reason text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index care_requests_parent_profile_idx on public.care_requests (parent_profile_id);

create trigger set_updated_at
  before update on public.care_requests
  for each row execute function public.set_updated_at();

alter table public.care_requests enable row level security;

create policy "care_requests_owner" on public.care_requests
  for all
  using (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id and pp.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id and pp.user_id = auth.uid()
    )
  );

create policy "care_requests_admin" on public.care_requests
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
