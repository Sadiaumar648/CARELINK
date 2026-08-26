-- Follow-up to 20260827220000: doc 5 already defines
-- verification_submissions.images_purge_after for exactly this purpose,
-- and it reads better than the photos_purged_at column just added (a
-- deadline the job acts on, rather than a fact the job records) — use
-- it instead, and set it automatically 30 days past a decision, which
-- resolves the PRD's open question 5 ("how long should verification
-- photographs be retained after a decision is recorded?").
alter table public.verification_submissions
  drop column photos_purged_at;

-- id_document_path can now go null once the retention job has actually
-- deleted the file — the original NOT NULL predates retention and no
-- longer fits a submission whose photo has been purged.
alter table public.verification_submissions
  alter column id_document_path drop not null;

create or replace function public.sync_verification_status_on_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('verified', 'rejected') and new.status is distinct from old.status then
    update public.users set verification_status = new.status where id = new.user_id;
    update public.verification_submissions
      set images_purge_after = new.reviewed_at + interval '30 days'
      where id = new.id;
  end if;
  return new;
end;
$$;
