-- CareLink location system, Phase 7: real distance for the priority
-- queue, without ever exposing a caregiver's raw coordinates to a
-- parent's own RLS-scoped client (the architecture every route in this
-- app already runs on — dispatch.ts explicitly never uses service-role
-- for its own logic). SECURITY DEFINER, same established pattern as
-- is_parent_profile_owner/is_staff_profile_owner (20260827140000): this
-- function reads staff_dispatch_locations/staff_profiles with elevated
-- privilege internally, but returns ONLY staff_profile_id and a
-- computed distance_km — never latitude/longitude. A parent can call
-- this (it's the one deliberate, narrow read path into a caregiver's
-- location this schema allows), but can never see the coordinates
-- themselves through it.
--
-- Falls back from a caregiver's live dispatch fix (staff_dispatch_
-- locations, freshest signal) to their base/service location
-- (staff_profiles.base_latitude/base_longitude, Phase 3) when no live
-- fix exists — a caregiver who hasn't gone Available yet still gets a
-- reasonable distance estimate for ordinary search; dispatch-specific
-- staleness (Part 6) is enforced separately in application code
-- (lib/dispatch-config.ts's MAX_DISPATCH_LOCATION_AGE_SECONDS), not
-- here. A caregiver with neither simply isn't returned — the caller
-- treats a missing row as "no coordinates, fall back to the area
-- string match", never a fabricated distance.
--
-- Haversine great-circle distance — no PostGIS extension needed for a
-- straight-line estimate at city scale, which is all city-level
-- childcare matching needs.
create or replace function public.nearby_caregiver_distances(
  request_lat double precision,
  request_lng double precision,
  staff_ids uuid[]
)
returns table (staff_profile_id uuid, distance_km double precision)
language sql
security definer
set search_path = public
stable
as $$
  select
    sp.id as staff_profile_id,
    2 * 6371 * asin(
      sqrt(
        power(sin(radians(coalesce(sdl.latitude, sp.base_latitude) - request_lat) / 2), 2) +
        cos(radians(request_lat)) * cos(radians(coalesce(sdl.latitude, sp.base_latitude))) *
        power(sin(radians(coalesce(sdl.longitude, sp.base_longitude) - request_lng) / 2), 2)
      )
    ) as distance_km
  from public.staff_profiles sp
  left join public.staff_dispatch_locations sdl on sdl.staff_profile_id = sp.id
  where sp.id = any(staff_ids)
    and coalesce(sdl.latitude, sp.base_latitude) is not null
    and coalesce(sdl.longitude, sp.base_longitude) is not null
$$;

grant execute on function public.nearby_caregiver_distances(double precision, double precision, uuid[])
  to authenticated;
