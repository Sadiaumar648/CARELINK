-- A "Request a Nanny" care request (and the booking it becomes) can now
-- cover more than one child. ward_id stays exactly as it was — the
-- "primary" child, the first one selected, and what every existing
-- read, every existing row, and the caregiver's emergency/ward-detail
-- reveal already point to. ward_ids is the full set; a new row always
-- has ward_id as ward_ids[1].
--
-- Price is regular rate x hours x number of children, computed
-- server-side in app/api/care-requests/route.ts and
-- lib/services/dispatch.ts from ward_ids — never trusted from the
-- client (same discipline as every other amount in this app).

alter table public.care_requests add column ward_ids uuid[] not null default '{}';
alter table public.bookings add column ward_ids uuid[] not null default '{}';

-- Backfill: every existing single-child row's set is just its one child.
update public.care_requests
  set ward_ids = array[ward_id]
  where ward_id is not null and ward_ids = '{}';
update public.bookings
  set ward_ids = array[ward_id]
  where ward_id is not null and ward_ids = '{}';

-- The "a caregiver reads a ward only through a booking" policy now
-- matches any child on the booking, not only the primary ward_id. The
-- ward_id = wards.id branch is kept so a booking created before this
-- migration (or through the direct /api/bookings flow, which stays
-- single-child) still resolves. Same status gate, same "only your own
-- bookings" join. Original: 20260827110000_bookings.sql.
drop policy if exists "wards_caregiver_via_booking" on public.wards;
create policy "wards_caregiver_via_booking" on public.wards
  for select
  using (
    exists (
      select 1 from public.bookings b
      join public.staff_profiles sp on sp.id = b.staff_profile_id
      where (wards.id = any(b.ward_ids) or wards.id = b.ward_id)
        and sp.user_id = auth.uid()
        and b.status in ('accepted', 'paid', 'active', 'completed')
    )
  );
