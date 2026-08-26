-- Engineering Plan task 1.4: enums and core tables — users, parent_profiles,
-- staff_profiles. Mirrors doc 5 (Backend Schema) §2 and §4.1-4.4; RLS
-- follows doc 5 §5. Conventions (uuid PK, created_at/updated_at, money in
-- pesewas, enum over free text, RLS on every table) follow doc 5 §1.

create extension if not exists pgcrypto;

-- ── Enums ────────────────────────────────────────────────────────────────

create type public.user_role as enum ('parent', 'staff', 'admin');
create type public.account_status as enum ('invited', 'active', 'suspended');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');

-- ── Shared trigger: keep updated_at current on every table that has one ──

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── users ────────────────────────────────────────────────────────────────
-- One row per person, whatever their role. id mirrors the auth user id.

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text not null unique,
  phone_confirmed boolean not null default false,
  email text unique,
  verification_status public.verification_status not null default 'unverified',
  account_status public.account_status not null default 'active',
  invited_by uuid references public.users (id),
  invitation_code_hash text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Populates public.users whenever an auth user is created — by a parent's
-- self-registration (signUp with role/full_name/phone in user metadata,
-- task 1.7) or by an administrator issuing a roster invitation (Admin API
-- createUser with role='staff', account_status='invited', task 1.8).
-- SECURITY DEFINER so it can write to public.users regardless of who
-- triggered the auth.users insert.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, role, full_name, phone, account_status, invited_by)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'parent'),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce((new.raw_user_meta_data ->> 'account_status')::public.account_status, 'active'),
    nullif(new.raw_user_meta_data ->> 'invited_by', '')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Role lookup used by RLS policies below. SECURITY DEFINER so the inner
-- select runs as the function owner and is not itself subject to the RLS
-- policy on public.users — this is what avoids infinite recursion when a
-- policy needs to know the caller's role.
create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.users where id = auth.uid();
$$;

alter table public.users enable row level security;

create policy "users_select_own" on public.users
  for select
  using (auth.uid() = id);

create policy "users_select_admin" on public.users
  for select
  using (public.current_user_role() = 'admin');

create policy "users_update_own" on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users_update_admin" on public.users
  for update
  using (public.current_user_role() = 'admin');

-- Column-level grants enforce "a user updates their own row, except role
-- and account_status" (doc 5 §5) — the policies above control which rows,
-- this controls which columns.
revoke update on public.users from authenticated;
grant update (full_name, phone, email, last_seen_at) on public.users to authenticated;
grant update on public.users to service_role;

-- ── parent_profiles ─────────────────────────────────────────────────────

create table public.parent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  area text not null,
  address text,
  household_notes text,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  emergency_contact_relation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.parent_profiles
  for each row execute function public.set_updated_at();

alter table public.parent_profiles enable row level security;

create policy "parent_profiles_owner" on public.parent_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "parent_profiles_admin_read" on public.parent_profiles
  for select
  using (public.current_user_role() = 'admin');

-- The caregiver-on-an-open-booking read (doc 5 §5) is added in the
-- migration that introduces the bookings table.

-- ── staff_profiles ──────────────────────────────────────────────────────

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  photo_path text,
  bio text,
  years_experience smallint check (years_experience >= 0),
  hourly_rate integer not null check (hourly_rate > 0),
  languages text[],
  emergency_contact_name text not null,
  emergency_contact_phone text not null,
  rating_avg numeric(3, 2),
  rating_count integer not null default 0,
  bookings_completed integer not null default 0,
  accepting_bookings boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.staff_profiles
  for each row execute function public.set_updated_at();

alter table public.staff_profiles enable row level security;

create policy "staff_profiles_owner" on public.staff_profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "staff_profiles_admin" on public.staff_profiles
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- The public, verified-and-accepting read (doc 5 §6, the public_caregivers
-- view) is added alongside the matching algorithm in a later migration —
-- until then, no one but the owner and an administrator can read a staff
-- profile at all, which is a stricter default than the app needs and a
-- safe one to start from.
