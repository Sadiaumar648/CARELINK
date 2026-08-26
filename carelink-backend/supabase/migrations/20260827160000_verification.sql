-- Tasks 3.1, 3.2: private storage and the bidirectional verification
-- workflow. Mirrors doc 5 (Backend Schema) §4.7. id_document_number is
-- not application-encrypted — Supabase's managed Postgres already
-- encrypts data at rest at the platform level; column-level encryption
-- would add key-management scope this build doesn't need.

create type public.id_document_type as enum ('ghana_card', 'passport', 'voter_id');
create type public.photo_verdict as enum ('likely_match', 'uncertain', 'likely_mismatch', 'not_run');

create table public.verification_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  id_document_type public.id_document_type not null,
  id_document_number text not null,
  id_document_path text not null,
  selfie_path text,
  photo_verdict public.photo_verdict not null default 'not_run',
  photo_rationale text,
  photo_model_version text,
  reference_name text not null,
  reference_phone text not null,
  reference_relation text,
  reference_contacted boolean not null default false,
  status public.verification_status not null default 'pending',
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  rejection_reason text,
  consent_photo_at timestamptz,
  images_purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status != 'rejected' or rejection_reason is not null)
);

create index verification_submissions_user_idx on public.verification_submissions (user_id, created_at);
create index verification_submissions_status_idx on public.verification_submissions (status, created_at);

create trigger set_updated_at
  before update on public.verification_submissions
  for each row execute function public.set_updated_at();

alter table public.verification_submissions enable row level security;

create policy "verification_submissions_owner_read_insert" on public.verification_submissions
  for select
  using (user_id = auth.uid());

create policy "verification_submissions_owner_insert" on public.verification_submissions
  for insert
  with check (user_id = auth.uid());

create policy "verification_submissions_admin_all" on public.verification_submissions
  for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Denormalized users.verification_status stays in sync automatically —
-- a submission moves the account to pending; a decision moves it to
-- verified or rejected. Both are SECURITY DEFINER since authenticated
-- users are deliberately not granted UPDATE on this column directly
-- (migration 0001).

create or replace function public.sync_verification_status_on_submit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users set verification_status = 'pending' where id = new.user_id;
  return new;
end;
$$;

create trigger sync_verification_status_on_submit
  after insert on public.verification_submissions
  for each row execute function public.sync_verification_status_on_submit();

create or replace function public.sync_verification_status_on_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('verified', 'rejected') and new.status is distinct from old.status then
    update public.users set verification_status = new.status where id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger sync_verification_status_on_decision
  after update of status on public.verification_submissions
  for each row execute function public.sync_verification_status_on_decision();

-- ── Storage ──────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('identity-documents', 'identity-documents', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

-- Path convention for both buckets: "<user_id>/<filename>" — the first
-- path segment is the ownership check.

create policy "identity_documents_owner_rw" on storage.objects
  for all
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "identity_documents_admin_read" on storage.objects
  for select
  using (bucket_id = 'identity-documents' and public.current_user_role() = 'admin');

create policy "profile_photos_owner_write" on storage.objects
  for all
  using (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
