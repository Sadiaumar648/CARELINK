-- CareLink's parent-selected-nanny model: a 'pending' request already
-- went directly to the one caregiver it was offered to (never a
-- broadcast to several caregivers at once), so there's no "unrelated
-- caregiver" exposure to guard against — the same reasoning that
-- already lets that caregiver see the real care address on a pending
-- offer (see the bookings redaction routes). Ward/care-profile details
-- (allergies, medications, special needs, routine notes) are the other
-- half of "can I actually take this request" — a caregiver deciding
-- whether to accept needs to see them before accepting, not only after.
-- Declined/expired requests are unaffected: this only widens the
-- status list starting from 'pending'.
drop policy if exists "wards_caregiver_via_booking" on public.wards;
create policy "wards_caregiver_via_booking" on public.wards
  for select
  using (
    exists (
      select 1 from public.bookings b
      join public.staff_profiles sp on sp.id = b.staff_profile_id
      where (wards.id = any(b.ward_ids) or wards.id = b.ward_id)
        and sp.user_id = auth.uid()
        and b.status in ('pending', 'accepted', 'paid', 'active', 'completed')
    )
  );
