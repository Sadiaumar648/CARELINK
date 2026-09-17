-- Academic simulation only (see lib/services/identity-verification/
-- README.md and MockNIAProvider): CareLink is NOT connected to the real
-- National Identification Authority. This table records the result of
-- the simulated Ghana Card PIN + live-photo check a parent completes on
-- their own account page — entirely separate from the existing,
-- real-admin-reviewed verification_submissions table (which stays
-- exactly as it is, still shared by both parent and caregiver
-- onboarding). Every attempt is kept as its own row, mirroring
-- verification_submissions' own "never overwrite, keep every attempt"
-- shape — never a real Ghana Card PIN or raw biometric data, only the
-- pass/fail outcome of the simulated checks.
create table public.parent_identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null check (status in ('verified', 'failed')),
  provider text not null default 'mock_nia_ivsp',
  pin_match boolean not null,
  biodata_match boolean not null,
  biometric_match boolean not null,
  failure_reason text check (
    failure_reason is null
    or failure_reason in ('pin_mismatch', 'biometric_mismatch', 'incomplete')
  ),
  -- The demo "record" the simulation returns — always exactly what the
  -- parent themselves typed/has on file (their own registered name, the
  -- date of birth they entered on this form), never an invented
  -- identity. Null on a failed attempt, where no record was "found".
  verified_name text,
  verified_date_of_birth date,
  -- The live selfie this attempt was checked against — same private
  -- bucket and owner-only RLS as verification_submissions' own photos
  -- (identity-documents; see 20260827160000_verification.sql). Not
  -- covered by the existing retention job (internal/retention only
  -- scans verification_submissions), since this is a separate,
  -- additive feature — acceptable for a demo/academic simulation.
  selfie_path text,
  verification_reference text not null,
  created_at timestamptz not null default now()
);

create index parent_identity_verifications_user_idx
  on public.parent_identity_verifications (user_id, created_at desc);

alter table public.parent_identity_verifications enable row level security;

create policy "parent_identity_verifications_owner_read" on public.parent_identity_verifications
  for select
  using (user_id = auth.uid());

create policy "parent_identity_verifications_owner_insert" on public.parent_identity_verifications
  for insert
  with check (user_id = auth.uid());

create policy "parent_identity_verifications_admin_read" on public.parent_identity_verifications
  for select
  using (public.current_user_role() = 'admin');
