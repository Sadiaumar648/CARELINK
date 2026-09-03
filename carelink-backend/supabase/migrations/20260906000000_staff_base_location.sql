-- CareLink location system, Phase 3: a caregiver's map-resolved
-- BASE/SERVICE location (Part 3) — the place they normally operate
-- from, not their exact current position (that's Phase 5's live
-- dispatch location, a separate concept and a separate table still to
-- come). Purely additive and all nullable: every existing staff_profiles
-- row is untouched, and this is not (yet) required to save a profile —
-- see app/api/staff/profile/route.ts. staff_areas (the caregiver's
-- named list of service areas) is untouched; this is a different,
-- complementary concept, not a replacement.

alter table public.staff_profiles
  add column base_address text,
  add column base_latitude double precision
    check (base_latitude is null or base_latitude between -90 and 90),
  add column base_longitude double precision
    check (base_longitude is null or base_longitude between -180 and 180),
  add column base_place_id text;
