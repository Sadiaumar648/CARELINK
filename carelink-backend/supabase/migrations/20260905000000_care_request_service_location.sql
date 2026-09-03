-- CareLink location system, Phase 1: real coordinates for a parent's
-- CARE SERVICE LOCATION (not necessarily their current location — see
-- app/api/care-requests/route.ts and packages/shared/src/schemas/
-- care-request.ts for the enforced "no resolved location, no request"
-- rule this supports). Purely additive: every new column is nullable
-- or has a safe default, so every existing care_requests row is
-- untouched. No RLS policy change needed: these are new columns on an
-- already row-level-secured table (care_requests_owner, 20260903000000),
-- which already covers the whole row.
--
-- `location` itself keeps its exact current meaning: the COARSE
-- area/suburb string existing search and dispatch already exact-match
-- against staff_areas.area (lib/services/matching.ts's computeAreaFit,
-- lib/services/dispatch.ts's round-0 area filter). Geocoding a full
-- street address and writing it into `location` verbatim would silently
-- break that exact-string match for every caregiver's declared area, so
-- the coarse suburb/neighbourhood component Nominatim's own address
-- breakdown returns is what continues to fill `location` — not the full
-- address. `service_address` below is the new, separate field for what
-- the parent actually sees and confirms on screen.

alter table public.care_requests
  add column service_address text,
  add column service_latitude double precision
    check (service_latitude is null or service_latitude between -90 and 90),
  add column service_longitude double precision
    check (service_longitude is null or service_longitude between -180 and 180),
  add column location_place_id text,
  add column location_source text
    check (location_source is null or location_source in ('current_location', 'gps_address')),
  -- The real enforcement point isn't this column alone (a client could
  -- claim true without real coordinates) — it's the backend requiring
  -- service_latitude/service_longitude together with this being true,
  -- via createCareRequestSchema. Kept as an explicit column rather than
  -- inferred from "coordinates present" so a future admin/reporting
  -- query can filter on it directly without recomputing the rule.
  add column location_resolved boolean not null default false;
