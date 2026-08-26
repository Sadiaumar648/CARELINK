-- Engineering Plan tasks 2.2, 2.3: skills, service areas and availability
-- for a staff profile. Mirrors doc 5 (Backend Schema) §2 and §4.5-4.6.

create type public.skill_tag as enum (
  'infant_care',
  'toddler_care',
  'school_age_supervision',
  'newborn_care',
  'meal_preparation',
  'special_needs_care',
  'light_housekeeping'
);

create type public.day_part as enum ('morning', 'afternoon', 'evening', 'overnight');

-- ── staff_skills ─────────────────────────────────────────────────────────
-- A join table rather than an array, so the skill-match factor (task 2.7)
-- can be computed and indexed in SQL.

create table public.staff_skills (
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  skill public.skill_tag not null,
  primary key (staff_profile_id, skill)
);

alter table public.staff_skills enable row level security;

create policy "staff_skills_owner" on public.staff_skills
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

create policy "staff_skills_admin" on public.staff_skills
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ── staff_areas ──────────────────────────────────────────────────────────

create table public.staff_areas (
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  area text not null,
  is_primary boolean not null default false,
  primary key (staff_profile_id, area)
);

alter table public.staff_areas enable row level security;

create policy "staff_areas_owner" on public.staff_areas
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

create policy "staff_areas_admin" on public.staff_areas
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- ── availability_windows ────────────────────────────────────────────────
-- Recurring weekly declaration, captured as a tapped grid (doc 3, App
-- Flow, §2.3 step 3): day-of-week plus a named part of the day.

create table public.availability_windows (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  part public.day_part not null,
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

create index staff_availability_windows_staff_idx on public.availability_windows (staff_profile_id);

alter table public.availability_windows enable row level security;

create policy "availability_windows_owner" on public.availability_windows
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

create policy "availability_windows_admin_read" on public.availability_windows
  for select
  using (public.current_user_role() = 'admin');

-- ── availability_exceptions ─────────────────────────────────────────────
-- Specific dates off (or, occasionally, an extra date on).

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid not null references public.staff_profiles (id) on delete cascade,
  on_date date not null,
  unavailable boolean not null default true,
  note text,
  unique (staff_profile_id, on_date)
);

alter table public.availability_exceptions enable row level security;

create policy "availability_exceptions_owner" on public.availability_exceptions
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

create policy "availability_exceptions_admin_read" on public.availability_exceptions
  for select
  using (public.current_user_role() = 'admin');
