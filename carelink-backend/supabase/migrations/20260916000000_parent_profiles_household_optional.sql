-- A parent no longer has to set up their "household" (area, emergency
-- contact) before adding their first child. Each care request already
-- carries its own real, resolved service location independently (see
-- care_requests.service_latitude/service_longitude) — a general
-- household "area" was redundant with that and, per the product
-- decision here, a parent's location can change, so asking for one
-- fixed area upfront doesn't fit the model. area/emergency_contact_*
-- were the only NOT NULL columns blocking a bare parent_profiles row
-- from being created on demand (see POST /api/wards, which now creates
-- one automatically the first time a parent adds a ward, with these
-- left null). The Settings "household" form still exists and still
-- requires real values when a parent chooses to fill it in — this
-- migration only removes the database-level requirement that blocked
-- a profile from existing at all before that.

alter table public.parent_profiles
  alter column area drop not null;

alter table public.parent_profiles
  alter column emergency_contact_name drop not null;

alter table public.parent_profiles
  alter column emergency_contact_phone drop not null;
