-- Admin "Generate Caregiver Onboarding Link" — a real, admin-managed
-- shareable link an agency caregiver would use to self-register. New
-- table, additive only: nothing existing changes.
--
-- Token storage: plaintext, not hashed. This is a deliberate departure
-- from the existing invitation-code pattern (users.invitation_code_hash,
-- lib/invitations.ts) — that code is a private, one-time secret told to
-- exactly one recipient, so hashing (and "shown once, never again")
-- is right for it. This link is the opposite: meant to be shared
-- broadly with many caregivers and re-copied by the admin on demand
-- (the reference UI's own "Copy link" row action requires this). The
-- table itself is never exposed outside admin RLS, and the frontend is
-- never the authority on validity — a future validation route would
-- still check status/expiry/registration_count server-side on every use.
--
-- registration_count starts and stays at 0 until a real
-- /caregiver/join/[token] self-registration flow exists to increment
-- it — that page is a separate, larger, not-yet-approved piece of work
-- and is not part of this migration.

create type public.onboarding_link_status as enum ('active', 'deactivated');

create table public.caregiver_onboarding_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  label text not null default 'Agency Caregiver Link',
  created_by uuid not null references public.users (id),
  max_registrations integer not null check (max_registrations > 0),
  registration_count integer not null default 0 check (registration_count >= 0),
  expires_at timestamptz,
  status public.onboarding_link_status not null default 'active',
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at
  before update on public.caregiver_onboarding_links
  for each row execute function public.set_updated_at();

alter table public.caregiver_onboarding_links enable row level security;

-- Admin-only, full stop — mirrors the single "for all" admin policy
-- shape already used by staff_profiles_admin / reports_admin_all.
create policy "caregiver_onboarding_links_admin_all" on public.caregiver_onboarding_links
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');
