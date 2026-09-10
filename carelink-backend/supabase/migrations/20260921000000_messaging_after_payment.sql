-- Messaging now opens only once the parent has PAID — a caregiver
-- accepting is no longer enough. This matches CareLink's finalized
-- flow: the parent picks a caregiver, the caregiver accepts, the
-- parent pays, and only then can the two message each other.
--
-- Only the INSERT gate tightens (drops 'accepted', keeps 'paid' and
-- 'active'). The read policy is deliberately left as-is: an
-- accepted-but-unpaid booking simply has an empty thread, and once
-- messages exist both parties keep read access through 'completed'
-- and beyond, exactly as before.
--
-- Original policy: migration 20260827200000_messaging_reviews_reports.sql.

drop policy if exists "messages_insert_open_thread" on public.messages;

create policy "messages_insert_open_thread" on public.messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status in ('paid', 'active')
        and (
          public.is_parent_profile_owner(b.parent_profile_id)
          or public.is_staff_profile_owner(b.staff_profile_id)
        )
    )
  );
