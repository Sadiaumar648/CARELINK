-- Security review finding: the owner policy on identity-documents was
-- "for all" (select/insert/update/delete), letting a submitter alter or
-- delete their own ID/selfie after submitting — including after an
-- admin has already opened the review queue. A submitter only ever
-- needs to upload once and, incidentally, view what they uploaded;
-- split the policy so neither update nor delete is available to them.
drop policy "identity_documents_owner_rw" on storage.objects;

create policy "identity_documents_owner_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "identity_documents_owner_read" on storage.objects
  for select
  using (
    bucket_id = 'identity-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Retention: the PRD (§11, open question 5) leaves how long verification
-- photographs are kept unresolved. photos_purged_at records when a
-- scheduled job (task 5.x) removed the underlying storage files — the
-- submission row, decision and verdict are kept indefinitely for audit
-- (PRD F3), only the image files themselves are deleted, per the F7
-- data-minimisation principle.
alter table public.verification_submissions
  add column photos_purged_at timestamptz;
