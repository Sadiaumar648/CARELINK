-- Task 3.9/doc 5 §4.4: staff_profiles.bookings_completed is "maintained
-- by trigger" — incremented whenever a booking reaches completed.

create or replace function public.increment_bookings_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    update public.staff_profiles
    set bookings_completed = bookings_completed + 1
    where id = new.staff_profile_id;
  end if;
  return new;
end;
$$;

create trigger increment_bookings_completed
  after update of status on public.bookings
  for each row execute function public.increment_bookings_completed();
