-- Tasks 3.6, 3.7, 3.9. Mirrors doc 5 (Backend Schema) §4.10 and §4.13.

create type public.momo_network as enum ('mtn', 'telecel', 'airteltigo');
create type public.payment_status as enum (
  'initiated',
  'pending',
  'succeeded',
  'failed',
  'timed_out',
  'refunded'
);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.users (id),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (key, value) values
  ('commission_rate', '0.15'),
  ('request_expiry_hours', '48'),
  ('image_retention_days', '90');

alter table public.platform_settings enable row level security;

create policy "platform_settings_read_authenticated" on public.platform_settings
  for select
  using (auth.role() = 'authenticated');

create policy "platform_settings_admin_write" on public.platform_settings
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id),
  network public.momo_network not null,
  payer_phone text not null,
  amount integer not null check (amount > 0),
  status public.payment_status not null default 'initiated',
  provider_reference text unique,
  provider_payload jsonb,
  is_simulated boolean not null default true,
  commission_rate numeric(4, 3),
  commission_amount integer,
  payout_amount integer,
  failure_reason text,
  refunded_amount integer not null default 0,
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    commission_amount is null or payout_amount is null
    or commission_amount + payout_amount = amount
  )
);

create index payments_booking_idx on public.payments (booking_id, created_at);

-- At most one succeeded payment per booking — a double payment is
-- impossible at the storage level (doc 5 §4.10).
create unique index payments_one_succeeded_per_booking
  on public.payments (booking_id)
  where (status = 'succeeded');

create trigger set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

alter table public.payments enable row level security;

create policy "payments_read_parties" on public.payments
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

create policy "payments_insert_parent" on public.payments
  for insert
  with check (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and public.is_parent_profile_owner(b.parent_profile_id)
    )
  );

create policy "payments_update_parties" on public.payments
  for update
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

-- ── Cancellation columns already exist on bookings (migration 0007) ────
-- Session start/end and cancellation are pure status transitions plus
-- these columns; no schema change needed for tasks 3.8/3.10 beyond what
-- 0007 already has.
