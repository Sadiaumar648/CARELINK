-- Tasks 4.7, 4.8, 4.9. Mirrors doc 5 (Backend Schema) §4.11-4.12.

-- ── messages ─────────────────────────────────────────────────────────────
-- Booking-scoped only. Sending is allowed once accepted (doc 3, App Flow,
-- §3.3: "message thread not yet open" while pending) through active; the
-- thread stays readable after the booking closes but stops accepting
-- new messages.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  sender_id uuid not null references public.users (id),
  body text not null,
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_booking_idx on public.messages (booking_id, created_at);

alter table public.messages enable row level security;

create policy "messages_read_parties" on public.messages
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

create policy "messages_insert_open_thread" on public.messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and b.status in ('accepted', 'paid', 'active')
        and (
          public.is_parent_profile_owner(b.parent_profile_id)
          or public.is_staff_profile_owner(b.staff_profile_id)
        )
    )
  );

create policy "messages_update_mark_read" on public.messages
  for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          public.is_parent_profile_owner(b.parent_profile_id)
          or public.is_staff_profile_owner(b.staff_profile_id)
        )
    )
  )
  with check (true);

-- ── reviews ──────────────────────────────────────────────────────────────
-- The unique constraint on booking_id is the anti-fraud mechanism: no
-- completed booking, no review (doc 5 §4.11).

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings (id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  staff_response text,
  hidden_by_admin boolean not null default false,
  hidden_reason text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

alter table public.reviews enable row level security;

create policy "reviews_read_parties" on public.reviews
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

create policy "reviews_insert_parent_on_completed" on public.reviews
  for insert
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.status = 'completed' and public.is_parent_profile_owner(b.parent_profile_id)
    )
  );

-- Staff add a response; an administrator hides a review — both via the
-- same update path, distinguished by which columns the route sets.
create policy "reviews_update_staff_or_admin" on public.reviews
  for update
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (public.is_staff_profile_owner(b.staff_profile_id) or public.current_user_role() = 'admin')
    )
  );

-- Publicly visible average lives on staff_profiles already; this view is
-- for the review text itself, shown on a caregiver's public profile
-- (doc 3, App Flow, caregiver profile screen).
create view public.public_caregiver_reviews as
select
  b.staff_profile_id,
  r.rating,
  r.comment,
  r.staff_response,
  r.created_at
from public.reviews r
join public.bookings b on b.id = r.booking_id
where r.hidden_by_admin = false and r.deleted_at is null;

grant select on public.public_caregiver_reviews to authenticated;

create or replace function public.recalculate_staff_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_staff_profile_id uuid;
begin
  select staff_profile_id into target_staff_profile_id
  from public.bookings where id = coalesce(new.booking_id, old.booking_id);

  update public.staff_profiles sp
  set
    rating_avg = (
      select avg(r.rating)::numeric(3, 2)
      from public.reviews r
      join public.bookings b on b.id = r.booking_id
      where b.staff_profile_id = target_staff_profile_id
        and r.hidden_by_admin = false and r.deleted_at is null
    ),
    rating_count = (
      select count(*)
      from public.reviews r
      join public.bookings b on b.id = r.booking_id
      where b.staff_profile_id = target_staff_profile_id
        and r.hidden_by_admin = false and r.deleted_at is null
    )
  where sp.id = target_staff_profile_id;

  return coalesce(new, old);
end;
$$;

create trigger recalculate_staff_rating_ins
  after insert on public.reviews
  for each row execute function public.recalculate_staff_rating();

create trigger recalculate_staff_rating_upd
  after update on public.reviews
  for each row execute function public.recalculate_staff_rating();

-- ── reports ──────────────────────────────────────────────────────────────

create type public.report_category as enum ('no_show', 'conduct', 'payment', 'safety', 'other');
create type public.report_status as enum ('open', 'investigating', 'resolved');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings (id),
  reporter_id uuid not null references public.users (id),
  subject_user_id uuid not null references public.users (id),
  category public.report_category not null,
  description text not null,
  status public.report_status not null default 'open',
  assigned_to uuid references public.users (id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reporter_id != subject_user_id),
  check (status != 'resolved' or resolution_note is not null)
);

create index reports_status_idx on public.reports (status, created_at);

create trigger set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

alter table public.reports enable row level security;

create policy "reports_reporter_read_own" on public.reports
  for select
  using (reporter_id = auth.uid());

create policy "reports_admin_all" on public.reports
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "reports_insert_reporter" on public.reports
  for insert
  with check (reporter_id = auth.uid());

-- An open or investigating report blocks the subject reaching verified
-- status (doc 1, PRD, §F3) — enforced at the point of decision, not by a
-- constraint here, since an administrator may still reject a submission
-- for someone with an open report.
