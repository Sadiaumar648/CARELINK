-- Supports the redesigned caregiver-join-link flow: identity (Ghana
-- Card number + live photo) is now collected directly on the join
-- form, submitted immediately as a lightweight verification_submissions
-- row (no ID-card photo, no reference contact — those stay required for
-- the original document-upload wizard other flows still use), so it
-- shows up in the admin's existing Verifications queue for review.

-- ── 1. Restore the verification gate on public_caregivers ──────────────
-- Migration 20260827170000 ("Task 3.3") correctly added
-- "verification_status = 'verified'" to this view's WHERE clause. Every
-- later migration that had to CREATE OR REPLACE this view for an
-- unrelated reason (20260901000000, 20260902000000, 20260908000000)
-- carried the column list forward but silently dropped that clause —
-- an accumulated regression, not a deliberate change; nothing since
-- Task 3.3 ever intended to remove it. Checked against live data before
-- writing this: every real, non-test caregiver currently visible in
-- search is already verified, so restoring the clause changes nothing
-- for any of them — only for future unverified accounts, which is the
-- point. Full column list carried forward unchanged from
-- 20260908000000, the most recent version.
create or replace view public.public_caregivers as
select
  sp.id as staff_profile_id,
  sp.user_id,
  u.full_name,
  u.verification_status,
  sp.photo_path,
  sp.bio,
  sp.years_experience,
  sp.hourly_rate,
  sp.languages,
  sp.rating_avg,
  sp.rating_count,
  sp.bookings_completed,
  sp.accepting_bookings,
  coalesce(
    (select array_agg(ss.skill) from public.staff_skills ss where ss.staff_profile_id = sp.id),
    '{}'
  ) as skills,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object('area', sa.area, 'isPrimary', sa.is_primary))
      from public.staff_areas sa
      where sa.staff_profile_id = sp.id
    ),
    '[]'::jsonb
  ) as areas,
  u.verification_method,
  sp.caregiver_type,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', cq.name,
          'institution', cq.institution,
          'year', cq.year,
          'verificationStatus', cq.verification_status
        )
      )
      from public.caregiver_qualifications cq
      where cq.staff_profile_id = sp.id
    ),
    '[]'::jsonb
  ) as qualifications,
  sp.dispatch_available
from public.staff_profiles sp
join public.users u on u.id = sp.user_id
where u.account_status = 'active'
  and sp.accepting_bookings = true
  and u.verification_status = 'verified'
  and u.email not like '%@example.com'
  and u.email not like '%@carelink.invite'
  and u.email not like '%@carelink.seed';

grant select on public.public_caregivers to authenticated;

-- ── 2. verification_submissions: document photo + reference optional ──
-- The join-link flow (POST /api/auth/join-onboarding-link) collects an
-- ID number and a live photo, but never a photo of the physical card
-- and never a reference contact — there's no wizard step left to ask
-- for either. Both were NOT NULL, which would have blocked inserting a
-- submission at all for this path. Existing rows are untouched (every
-- one already has real values here); this only lets a new row omit
-- them. The original document-upload wizard (api/verification/
-- submissions, still used by /onboarding/identity) keeps requiring both
-- at the application/zod level — this migration only relaxes what the
-- database itself will accept.
alter table public.verification_submissions
  alter column id_document_path drop not null,
  alter column reference_name drop not null,
  alter column reference_phone drop not null;
