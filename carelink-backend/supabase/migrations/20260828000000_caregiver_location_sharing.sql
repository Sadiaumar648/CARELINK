-- Caregiver safety spec ("SafeTrack"): live location sharing, strictly
-- scoped to an active booking. One row per booking, holding only the
-- latest fix — no historical trail is kept, and the row is deleted the
-- moment the session ends (see the /end route) or the caregiver turns
-- sharing off, per the spec's "do not create permanent location
-- history" instruction. Reuses is_parent_profile_owner/
-- is_staff_profile_owner (fix_rls_recursion.sql) — the same
-- SECURITY DEFINER pattern every other booking-scoped table already
-- uses, so this can't reintroduce the RLS recursion that migration
-- fixed.

create table public.caregiver_locations (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  updated_at timestamptz not null default now()
);

alter table public.caregiver_locations enable row level security;

-- Readable by the two parties to the booking, or an admin — and only
-- while the booking is actually active. The row is also deleted once
-- the booking stops being active (see the /end route's cleanup), so
-- this status check is defense in depth, not the only safeguard.
create policy "caregiver_locations_read_active" on public.caregiver_locations
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status = 'active'
        and (
          public.is_parent_profile_owner(b.parent_profile_id)
          or public.is_staff_profile_owner(b.staff_profile_id)
          or public.current_user_role() = 'admin'
        )
    )
  );

-- Only the assigned caregiver, only while their own booking is active —
-- never a bookingless write, never on another caregiver's booking.
create policy "caregiver_locations_write_own_active" on public.caregiver_locations
  for insert
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status = 'active'
        and public.is_staff_profile_owner(b.staff_profile_id)
    )
  );

create policy "caregiver_locations_update_own_active" on public.caregiver_locations
  for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status = 'active'
        and public.is_staff_profile_owner(b.staff_profile_id)
    )
  );

-- A caregiver may clear their own row (turning sharing off) regardless
-- of the booking's current status — the /end route's own cleanup goes
-- through the service role, so it works no matter which party ended
-- the session, without needing this policy to allow that.
create policy "caregiver_locations_delete_own" on public.caregiver_locations
  for delete
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and public.is_staff_profile_owner(b.staff_profile_id)
    )
  );
