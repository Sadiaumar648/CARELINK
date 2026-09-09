-- Caregiver onboarding no longer collects "years of experience" (removed
-- from every self-service form — that value is agency-supplied, not
-- caregiver-declared, matching staff_profiles.hourly_rate's own
-- "agency-controlled" precedent). years_experience was already nullable
-- (see 20260826060000_core_users_and_profiles.sql — no NOT NULL on that
-- column), so no schema change is needed for it here; only the zod
-- schema requirement is dropped (packages/shared/src/schemas/
-- staff-profile.ts).
--
-- What genuinely needs a migration: emergency_contact_name/phone are
-- NOT NULL today, which blocks the very first PATCH /api/staff/profile
-- a newly-claimed caregiver makes during onboarding (setting only
-- caregiverType + base location — no emergency contact yet). Same
-- situation, same resolution, as parent_profiles' household fields in
-- 20260916000000_parent_profiles_household_optional.sql: make them
-- nullable so a caregiver can complete onboarding first and add an
-- emergency contact later from Settings, without ever losing an
-- existing value (this only relaxes the constraint — no existing row's
-- data is touched).
alter table public.staff_profiles
  alter column emergency_contact_name drop not null,
  alter column emergency_contact_phone drop not null;
