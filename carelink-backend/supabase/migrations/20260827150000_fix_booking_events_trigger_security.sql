-- Fixes migration 0007's booking_events triggers: they ran as the
-- calling (authenticated) role, which has no insert policy on
-- booking_events by design (doc 5 §5: only the service role or a
-- trusted trigger may write there). Without SECURITY DEFINER, the
-- trigger itself was blocked by the RLS it was meant to bypass, so even
-- a legitimate booking insert failed with "new row violates row-level
-- security policy for table booking_events". Caught by the booking
-- request integration test.

create or replace function public.log_booking_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_id)
  values (new.id, null, new.status, auth.uid());
  return new;
end;
$$;

create or replace function public.log_booking_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_id)
  values (new.id, old.status, new.status, auth.uid());
  return new;
end;
$$;
