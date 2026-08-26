-- Task 4.13. In-app only in this phase (doc 5 §4.13). Rows are written
-- exclusively by triggers on the events that already exist — never by a
-- direct client insert, same pattern as booking_events.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  kind text not null,
  booking_id uuid references public.bookings (id),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at);

alter table public.notifications enable row level security;

create policy "notifications_owner_read" on public.notifications
  for select
  using (user_id = auth.uid());

create policy "notifications_owner_update" on public.notifications
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.create_notification(
  p_user_id uuid,
  p_kind text,
  p_booking_id uuid,
  p_body text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, booking_id, body)
  values (p_user_id, p_kind, p_booking_id, p_body);
$$;

create or replace function public.notify_on_booking_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_user_id uuid;
begin
  select user_id into staff_user_id from public.staff_profiles where id = new.staff_profile_id;
  perform public.create_notification(staff_user_id, 'booking_request', new.id, 'New booking request received');
  return new;
end;
$$;

create trigger notify_on_booking_created
  after insert on public.bookings
  for each row execute function public.notify_on_booking_created();

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
    end if;
  end if;
  return new;
end;
$$;

create trigger notify_on_booking_status_change
  after update of status on public.bookings
  for each row execute function public.notify_on_booking_status_change();

create or replace function public.notify_on_verification_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('verified', 'rejected') and new.status is distinct from old.status then
    perform public.create_notification(
      new.user_id,
      'verification_' || new.status,
      null,
      case when new.status = 'verified' then 'Your verification was approved' else 'Your verification was rejected' end
    );
  end if;
  return new;
end;
$$;

create trigger notify_on_verification_decision
  after update of status on public.verification_submissions
  for each row execute function public.notify_on_verification_decision();
