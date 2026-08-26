-- Fixes infinite RLS recursion: parent_profiles' caregiver-via-booking
-- policy queried bookings, whose own policies query parent_profiles,
-- forming a cycle Postgres refuses to evaluate ("infinite recursion
-- detected in policy for relation parent_profiles"). Caught by the
-- household/wards integration test.
--
-- Fix: cross-table existence checks go through SECURITY DEFINER helper
-- functions, which run as the function owner and so bypass RLS on the
-- table being checked internally — the same technique current_user_role()
-- already uses. Applied to every bookings<->parent_profiles/staff_profiles
-- policy, not just the one that broke, so the same cycle can't reappear
-- from a different direction later.

create or replace function public.is_parent_profile_owner(target_parent_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.parent_profiles pp
    where pp.id = target_parent_profile_id and pp.user_id = auth.uid()
  );
$$;

create or replace function public.is_staff_profile_owner(target_staff_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.id = target_staff_profile_id and sp.user_id = auth.uid()
  );
$$;

create or replace function public.caregiver_has_booking_with_parent(target_parent_profile_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.bookings b
    where b.parent_profile_id = target_parent_profile_id
      and public.is_staff_profile_owner(b.staff_profile_id)
  );
$$;

create or replace function public.caregiver_has_qualifying_booking_for_ward(target_ward_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.bookings b
    where b.ward_id = target_ward_id
      and b.status in ('accepted', 'paid', 'active', 'completed')
      and public.is_staff_profile_owner(b.staff_profile_id)
  );
$$;

-- ── parent_profiles ──
drop policy "parent_profiles_caregiver_via_booking" on public.parent_profiles;
create policy "parent_profiles_caregiver_via_booking" on public.parent_profiles
  for select
  using (public.caregiver_has_booking_with_parent(id));

-- ── wards ──
drop policy "wards_caregiver_via_booking" on public.wards;
create policy "wards_caregiver_via_booking" on public.wards
  for select
  using (public.caregiver_has_qualifying_booking_for_ward(id));

-- ── bookings — rewritten for consistency and to prevent a future ──
-- variant of the same cycle from a different entry point.
drop policy "bookings_read_parties" on public.bookings;
create policy "bookings_read_parties" on public.bookings
  for select
  using (
    public.is_parent_profile_owner(parent_profile_id)
    or public.is_staff_profile_owner(staff_profile_id)
    or public.current_user_role() = 'admin'
  );

drop policy "bookings_insert_parent" on public.bookings;
create policy "bookings_insert_parent" on public.bookings
  for insert
  with check (public.is_parent_profile_owner(parent_profile_id));

drop policy "bookings_update_parties" on public.bookings;
create policy "bookings_update_parties" on public.bookings
  for update
  using (
    public.is_parent_profile_owner(parent_profile_id)
    or public.is_staff_profile_owner(staff_profile_id)
    or public.current_user_role() = 'admin'
  );

-- ── booking_events ──
drop policy "booking_events_read_parties" on public.booking_events;
create policy "booking_events_read_parties" on public.booking_events
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          public.is_parent_profile_owner(b.parent_profile_id)
          or public.is_staff_profile_owner(b.staff_profile_id)
          or public.current_user_role() = 'admin'
        )
    )
  );
