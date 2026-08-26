-- Engineering Plan task 2.4: the Ward Care Profile. Mirrors doc 5
-- (Backend Schema) §4.3. Deliberately minimal — nothing about a child is
-- stored that a caregiver does not need to do the job.

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.parent_profiles (id) on delete cascade,
  display_name text not null,
  age_years smallint check (age_years between 0 and 17),
  allergies text,
  medications text,
  meal_notes text,
  routine_notes text,
  special_needs text,
  house_rules text,
  general_notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index wards_parent_profile_idx on public.wards (parent_profile_id);

create trigger set_updated_at
  before update on public.wards
  for each row execute function public.set_updated_at();

alter table public.wards enable row level security;

create policy "wards_owner" on public.wards
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

-- The caregiver-on-an-open-booking read (doc 5 §5) is added in the
-- migration that introduces the bookings table, same as parent_profiles.
