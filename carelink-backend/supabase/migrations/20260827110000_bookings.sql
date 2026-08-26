-- Engineering Plan task 2.10: the bookings table and state machine.
-- Mirrors doc 5 (Backend Schema) §4.8-4.9 and the transition table in
-- doc 2 (Technical Design) §4. Built ahead of its listed sprint position
-- because the availability view (2.5) and search (2.6) both need it to
-- exist to exclude already-booked time.

create extension if not exists btree_gist;

create type public.booking_status as enum (
  'pending',
  'accepted',
  'declined',
  'expired',
  'paid',
  'active',
  'completed',
  'cancelled',
  'disputed'
);

-- ── bookings ─────────────────────────────────────────────────────────────
-- Rate and total are snapshotted at request time, not read from the
-- caregiver's profile, so a later rate change cannot alter an agreed
-- arrangement.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  parent_profile_id uuid not null references public.parent_profiles (id),
  staff_profile_id uuid not null references public.staff_profiles (id),
  ward_id uuid references public.wards (id),
  status public.booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_hours numeric(4, 2) generated always as (
    extract(epoch from (ends_at - starts_at)) / 3600.0
  ) stored,
  hourly_rate integer not null,
  total_amount integer not null check (total_amount > 0),
  address text not null,
  one_off_notes text,
  terms_locked_at timestamptz,
  decline_reason text,
  cancelled_by uuid references public.users (id),
  cancel_reason text,
  session_started_at timestamptz,
  session_ended_at timestamptz,
  completed_at timestamptz,
  match_score numeric(5, 2),
  match_breakdown jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index bookings_staff_starts_idx on public.bookings (staff_profile_id, starts_at);
create index bookings_parent_created_idx on public.bookings (parent_profile_id, created_at);
create index bookings_status_starts_idx on public.bookings (status, starts_at);

-- No two accepted/paid/active bookings for the same caregiver may
-- overlap. Deliberately excludes pending: several parents may request the
-- same slot before one is accepted (doc 2, Technical Design, §4).
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    staff_profile_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
  where (status in ('accepted', 'paid', 'active'));

create trigger set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- Once terms are locked (on acceptance), the agreed facts of the booking
-- cannot change by either party.
create or replace function public.enforce_terms_lock()
returns trigger
language plpgsql
as $$
begin
  if old.terms_locked_at is not null then
    if new.starts_at is distinct from old.starts_at
      or new.ends_at is distinct from old.ends_at
      or new.hourly_rate is distinct from old.hourly_rate
      or new.total_amount is distinct from old.total_amount
      or new.address is distinct from old.address
    then
      raise exception 'Booking terms are locked and cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create trigger enforce_terms_lock
  before update on public.bookings
  for each row execute function public.enforce_terms_lock();

-- The state machine itself. One function, every legal edge from the
-- transition table in doc 2 (Technical Design) §4; anything else raises.
create or replace function public.enforce_booking_transition()
returns trigger
language plpgsql
as $$
declare
  allowed boolean;
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := (
    (old.status = 'pending' and new.status in ('accepted', 'declined', 'expired', 'cancelled'))
    or (old.status = 'accepted' and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid' and new.status in ('active', 'cancelled'))
    or (old.status = 'active' and new.status = 'completed')
    or (new.status = 'disputed')
  );

  if not allowed then
    raise exception 'Illegal booking status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;

create trigger enforce_booking_transition
  before update on public.bookings
  for each row execute function public.enforce_booking_transition();

alter table public.bookings enable row level security;

create policy "bookings_read_parties" on public.bookings
  for select
  using (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id and pp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

create policy "bookings_insert_parent" on public.bookings
  for insert
  with check (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id and pp.user_id = auth.uid()
    )
  );

create policy "bookings_update_parties" on public.bookings
  for update
  using (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id and pp.user_id = auth.uid()
    )
    or exists (
      select 1 from public.staff_profiles sp
      where sp.id = staff_profile_id and sp.user_id = auth.uid()
    )
    or public.current_user_role() = 'admin'
  );

-- ── booking_events ───────────────────────────────────────────────────────
-- Append-only audit trail, written automatically by triggers below —
-- never by direct client insert, so it can't be forgotten by application
-- code (doc 5 §5: "Insert by the service role").

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  actor_id uuid references public.users (id),
  note text,
  occurred_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, occurred_at);

alter table public.booking_events enable row level security;

create policy "booking_events_read_parties" on public.booking_events
  for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id
        and (
          exists (
            select 1 from public.parent_profiles pp
            where pp.id = b.parent_profile_id and pp.user_id = auth.uid()
          )
          or exists (
            select 1 from public.staff_profiles sp
            where sp.id = b.staff_profile_id and sp.user_id = auth.uid()
          )
          or public.current_user_role() = 'admin'
        )
    )
  );

-- No insert/update/delete policy for authenticated: only the service
-- role (which bypasses RLS by default in Supabase) or these triggers,
-- which run as the table owner, can write here.

create or replace function public.log_booking_creation()
returns trigger
language plpgsql
as $$
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_id)
  values (new.id, null, new.status, auth.uid());
  return new;
end;
$$;

create trigger log_booking_creation
  after insert on public.bookings
  for each row execute function public.log_booking_creation();

create or replace function public.log_booking_status_change()
returns trigger
language plpgsql
as $$
begin
  insert into public.booking_events (booking_id, from_status, to_status, actor_id)
  values (new.id, old.status, new.status, auth.uid());
  return new;
end;
$$;

create trigger log_booking_status_change
  after update of status on public.bookings
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_booking_status_change();

-- ── Deferred policies from earlier migrations ────────────────────────────
-- doc 5 §5: a caregiver reads a parent's area/household notes, and a
-- ward, only through a booking. Added here because both need the
-- bookings table to exist.

create policy "parent_profiles_caregiver_via_booking" on public.parent_profiles
  for select
  using (
    exists (
      select 1 from public.bookings b
      join public.staff_profiles sp on sp.id = b.staff_profile_id
      where b.parent_profile_id = parent_profiles.id and sp.user_id = auth.uid()
    )
  );

create policy "wards_caregiver_via_booking" on public.wards
  for select
  using (
    exists (
      select 1 from public.bookings b
      join public.staff_profiles sp on sp.id = b.staff_profile_id
      where b.ward_id = wards.id
        and sp.user_id = auth.uid()
        and b.status in ('accepted', 'paid', 'active', 'completed')
    )
  );
