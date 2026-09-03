-- CareLink's finalized payment workflow, Part 4: notify both sides when
-- an accepted-but-unpaid booking is automatically released by the
-- 10-minute payment window (lib/services/payment-window.ts). This is a
-- CREATE OR REPLACE on the one existing notification-writing trigger
-- function (notify_on_booking_status_change, 20260827210000) — no table
-- structure change, no data touched, no RLS change. Every branch already
-- in this function (accepted/declined/paid/completed) is reproduced
-- verbatim; only one new branch is added.
--
-- The new branch fires only for a 'cancelled' transition where
-- cancelled_by is null. That is a deliberate, narrow signal: the one
-- existing way a booking becomes 'cancelled' today
-- (app/api/bookings/[id]/cancel/route.ts, a parent or caregiver
-- explicitly cancelling) always sets cancelled_by to the acting user's
-- real id. The payment window's own lazy expiry
-- (expirePaymentWindowIfPassed) is the only code path that cancels a
-- booking without a human actor, so cancelled_by being null reliably
-- means "the payment window closed," never a parent's own manual
-- cancellation — no string-matching on cancel_reason, which a parent's
-- own typed reason could otherwise coincidentally collide with.

create or replace function public.notify_on_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_parent_user_id uuid;
  target_staff_user_id uuid;
begin
  if new.status is distinct from old.status then
    select user_id into target_parent_user_id from public.parent_profiles where id = new.parent_profile_id;
    select user_id into target_staff_user_id from public.staff_profiles where id = new.staff_profile_id;

    if new.status = 'accepted' then
      perform public.create_notification(target_parent_user_id, 'booking_accepted', new.id, 'Your booking request was accepted');
    elsif new.status = 'declined' then
      perform public.create_notification(target_parent_user_id, 'booking_declined', new.id, 'Your booking request was declined');
    elsif new.status = 'paid' then
      perform public.create_notification(target_staff_user_id, 'payment_received', new.id, 'Payment received for an upcoming booking');
    elsif new.status = 'completed' then
      perform public.create_notification(target_parent_user_id, 'booking_completed', new.id, 'Your booking is complete — leave a review');
    elsif new.status = 'cancelled' and new.cancelled_by is null then
      perform public.create_notification(target_parent_user_id, 'payment_window_expired', new.id, 'Your payment window expired — this booking was released');
      if target_staff_user_id is not null then
        perform public.create_notification(target_staff_user_id, 'booking_released', new.id, 'An unpaid booking was released — you are available for new requests');
      end if;
    end if;
  end if;
  return new;
end;
$$;
