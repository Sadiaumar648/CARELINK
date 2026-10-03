import type { SupabaseClient } from "@supabase/supabase-js";
import { hourlyRateFor, type SearchCaregiversQuery } from "@carelink/shared";
import { MAX_DISPATCH_LOCATION_AGE_SECONDS } from "@/lib/dispatch-config";
import {
  checkAvailability,
  type AvailabilityException,
  type AvailabilityWindow,
  type BusyRange,
} from "@/lib/services/availability";
import {
  computeAreaFit,
  computeAvailabilityFit,
  computeBudgetFit,
  computeMatchScore,
  computeProximityFit,
  computeRatingExperienceFit,
  computeSkillFit,
  type MatchBreakdown,
  type MatchWeights,
} from "@/lib/services/matching";

// Task 2.6's hard-filter-then-score pipeline, extracted verbatim from
// app/api/search/caregivers/route.ts (which now just calls this and
// formats the response) so the dispatch system can reuse the exact same
// eligibility/ranking logic instead of a second implementation of it —
// "reuse the matching logic," not reimplement it. The route's own
// external behaviour is unchanged: `options` is only ever populated by
// the dispatch service, which the route never passes.

const DEFAULT_ROSTER_MEDIAN_RATING = 3.5;

// A parent doesn't need to browse a roster of hundreds — the
// highest-scoring results genuinely are the most relevant ones, so
// this is a real cap on what the response contains, not a frontend
// display limit the full list is still fetched behind.
export const MAX_RESULTS = 10;

export type CaregiverRow = {
  staff_profile_id: string;
  user_id: string;
  full_name: string;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  areas: { area: string; isPrimary: boolean }[];
  caregiver_type: "nanny" | "babysitter" | null;
  [key: string]: unknown;
};

export type ScoredCaregiver = CaregiverRow & { matchScore: number; matchBreakdown: MatchBreakdown };

type FilterStep = { name: string; message: string; countBefore: number; countAfter: number };

export type CaregiverSearchOptions = {
  // Dispatch-only: none of these are set by the existing search route.
  caregiverType?: "nanny" | "babysitter";
  excludeStaffProfileIds?: string[];
  // CareLink location system, Part 4: require a live, fresh location
  // fix (staff_dispatch_locations) rather than falling back to base
  // location. No longer set by dispatch.ts (an approved, active
  // caregiver is automatically dispatch-eligible via accepting_bookings
  // now, whether or not they have location sharing on) — kept as a
  // real, working option in case a future caller genuinely needs a
  // live-fix-only filter, but nothing currently passes it.
  requireDispatchAvailable?: boolean;
  // CareLink location system, Part 7/8: a real distance ring, replacing
  // the area-string round for a request that has resolved coordinates.
  // The caller (dispatch.ts) picks one or the other per request, never
  // both — a request without coordinates keeps using query.area exactly
  // as before.
  maxDistanceKm?: number;
  // "conflicts" — used by the Request a Nanny pick-list: with a
  // requested date/time, exclude a caregiver only when they're already
  // on a booking that genuinely clashes with that window (or currently
  // mid-session), NEVER for being outside their declared weekly hours.
  // A caregiver decides for themselves whether to accept a request
  // outside their usual hours. "full" (the default, used by ordinary
  // search and dispatch) keeps the declared-hours check as well.
  availabilityCheck?: "full" | "conflicts";
};

export type CaregiverSearchResult = {
  results: ScoredCaregiver[];
  emptyState: { restrictiveFilter: string | null; message: string } | null;
};

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Task 2.6's empty state: name the filter that eliminated the most
// candidates, not just the first one applied, and offer to relax it.
function mostRestrictiveStep(steps: FilterStep[]): FilterStep | null {
  const withDrops = steps.map((s) => ({ ...s, drop: s.countBefore - s.countAfter }));
  const worst = withDrops.filter((s) => s.drop > 0).sort((a, b) => b.drop - a.drop)[0];
  return worst ?? null;
}

export async function findEligibleCaregivers(
  supabase: SupabaseClient,
  query: SearchCaregiversQuery,
  weights: MatchWeights,
  options: CaregiverSearchOptions = {},
): Promise<CaregiverSearchResult> {
  const { data: baseRows, error: baseErr } = await supabase.from("public_caregivers").select("*");
  if (baseErr) throw baseErr;

  let pool = (baseRows ?? []) as CaregiverRow[];
  const steps: FilterStep[] = [];

  function applyFilter(name: string, message: string, predicate: (c: CaregiverRow) => boolean) {
    const before = pool.length;
    pool = pool.filter(predicate);
    steps.push({ name, message, countBefore: before, countAfter: pool.length });
  }

  if (options.caregiverType) {
    applyFilter(
      "caregiverType",
      "No caregivers of this type are available.",
      (c) => c.caregiver_type === options.caregiverType,
    );
  }
  if (options.excludeStaffProfileIds?.length) {
    const excluded = new Set(options.excludeStaffProfileIds);
    applyFilter(
      "excluded",
      "Every eligible caregiver has already been offered this request.",
      (c) => !excluded.has(c.staff_profile_id),
    );
  }
  if (options.requireDispatchAvailable && pool.length > 0) {
    const ids = pool.map((c) => c.staff_profile_id);
    const { data: freshness, error: freshnessErr } = await supabase
      .from("caregiver_dispatch_freshness")
      .select("staff_profile_id, updated_at")
      .in("staff_profile_id", ids);
    if (freshnessErr) throw freshnessErr;
    const cutoff = Date.now() - MAX_DISPATCH_LOCATION_AGE_SECONDS * 1000;
    const freshById = new Map(
      (freshness ?? []).map((f) => [
        f.staff_profile_id as string,
        new Date(f.updated_at as string).getTime() >= cutoff,
      ]),
    );
    applyFilter(
      "dispatchAvailable",
      "No caregivers are currently available for dispatch nearby.",
      (c) => Boolean(c.dispatch_available) && freshById.get(c.staff_profile_id) === true,
    );
  }
  if (query.minExperience != null) {
    applyFilter(
      "minExperience",
      "Try lowering the minimum experience.",
      (c) => (c.years_experience ?? 0) >= query.minExperience!,
    );
  }
  if (query.minRating != null) {
    applyFilter(
      "minRating",
      "Try lowering the minimum rating.",
      (c) => (c.rating_avg ?? 0) >= query.minRating!,
    );
  }
  if (query.skills && query.skills.length > 0) {
    applyFilter("skills", "Try removing a skill.", (c) =>
      query.skills!.every((s) => c.skills.includes(s)),
    );
  }
  if (query.area) {
    const normalized = query.area.trim().toLowerCase();
    applyFilter("area", "Try a nearby area.", (c) =>
      c.areas.some((a) => a.area.trim().toLowerCase() === normalized),
    );
  }

  // CareLink location system, Part 7: real distance, when the caller
  // has resolved coordinates for the request (today: dispatch, from a
  // care request's service location) — computed once here, reused both
  // as a hard vicinity-ring filter (options.maxDistanceKm, below) and
  // for scoring further down. A candidate without a distance (no live
  // dispatch fix and no base location saved) is simply excluded from a
  // maxDistanceKm filter but never blocked from ordinary search, where
  // it keeps scoring on the existing area string-match instead.
  const distanceById = new Map<string, number>();
  if (query.latitude != null && query.longitude != null && pool.length > 0) {
    const { data: distances, error: distanceErr } = await supabase.rpc(
      "nearby_caregiver_distances",
      {
        request_lat: query.latitude,
        request_lng: query.longitude,
        staff_ids: pool.map((c) => c.staff_profile_id),
      },
    );
    if (distanceErr) throw distanceErr;
    for (const row of distances ?? []) {
      distanceById.set(row.staff_profile_id as string, Number(row.distance_km));
    }
  }

  if (options.maxDistanceKm != null) {
    const maxKm = options.maxDistanceKm;
    applyFilter(
      "proximity",
      "Try expanding your search radius.",
      (c) => (distanceById.get(c.staff_profile_id) ?? Infinity) <= maxKm,
    );
  }

  // A real "on duty right now" hard exclusion (CareLink location system,
  // Part 5) — independent of whatever window is being requested. The
  // availability check below already excludes a caregiver whose
  // *scheduled* booking window overlaps the request, but a session
  // running long past its stated end time (still status = 'active' in
  // the database, session_ended_at still null) isn't caught by a
  // time-range comparison alone. This checks the real, current status.
  // Skipped in "conflicts" mode: the overlap check below (which already
  // includes active bookings) is enough there, and a session that ends
  // well before the requested window shouldn't hide a caregiver from a
  // parent picking them for a later day.
  if (pool.length > 0 && options.availabilityCheck !== "conflicts") {
    const ids = pool.map((c) => c.staff_profile_id);
    const { data: busyNow, error: busyNowErr } = await supabase
      .from("caregiver_busy_times")
      .select("staff_profile_id, status")
      .in("staff_profile_id", ids)
      .eq("status", "active");
    if (busyNowErr) throw busyNowErr;
    const onDuty = new Set((busyNow ?? []).map((b) => b.staff_profile_id as string));
    applyFilter(
      "onDuty",
      "Every eligible caregiver is currently on an active booking.",
      (c) => !onDuty.has(c.staff_profile_id),
    );
  }

  let requestedRange: { starts: Date; ends: Date } | null = null;
  if (query.date && query.startTime && query.endTime) {
    const ends = new Date(`${query.date}T${query.endTime}:00Z`);
    // A multi-day request occupies the caregiver from day one's start
    // through the last day's end — extend the window by (days - 1) so a
    // caregiver already booked on any day of it counts as clashing.
    const extraDays = Math.max(0, (query.durationDays ?? 1) - 1);
    if (extraDays > 0) ends.setUTCDate(ends.getUTCDate() + extraDays);
    requestedRange = {
      starts: new Date(`${query.date}T${query.startTime}:00Z`),
      ends,
    };
  }

  if (requestedRange && pool.length > 0) {
    const ids = pool.map((c) => c.staff_profile_id);
    const [windowsRes, exceptionsRes, busyRes] = await Promise.all([
      supabase.from("caregiver_availability_windows").select("*").in("staff_profile_id", ids),
      supabase.from("caregiver_availability_exceptions").select("*").in("staff_profile_id", ids),
      supabase.from("caregiver_busy_times").select("*").in("staff_profile_id", ids),
    ]);
    if (windowsRes.error) throw windowsRes.error;
    if (exceptionsRes.error) throw exceptionsRes.error;
    if (busyRes.error) throw busyRes.error;

    const availabilityMode = options.availabilityCheck === "conflicts" ? "conflicts" : "full";
    applyFilter(
      "availability",
      availabilityMode === "conflicts"
        ? "Every caregiver is already booked for that time."
        : "Try a different time or date.",
      (c) => {
        const windows: AvailabilityWindow[] = (windowsRes.data ?? [])
          .filter((w) => w.staff_profile_id === c.staff_profile_id)
          .map((w) => ({
            weekday: w.weekday,
            startTime: String(w.start_time).slice(0, 5),
            endTime: String(w.end_time).slice(0, 5),
          }));
        const exceptions: AvailabilityException[] = (exceptionsRes.data ?? [])
          .filter((e) => e.staff_profile_id === c.staff_profile_id)
          .map((e) => ({ onDate: e.on_date, unavailable: e.unavailable }));
        const busy: BusyRange[] = (busyRes.data ?? [])
          .filter((b) => b.staff_profile_id === c.staff_profile_id)
          .map((b) => ({ startsAt: new Date(b.starts_at), endsAt: new Date(b.ends_at) }));

        return checkAvailability(
          windows,
          exceptions,
          busy,
          requestedRange!.starts,
          requestedRange!.ends,
          { mode: availabilityMode },
        ).available;
      },
    );
  }

  if (pool.length === 0) {
    const worst = mostRestrictiveStep(steps);
    return {
      results: [],
      emptyState: worst
        ? { restrictiveFilter: worst.name, message: worst.message }
        : { restrictiveFilter: null, message: "No caregivers are on the roster yet." },
    };
  }

  const ratedEnough = pool
    .filter((c) => c.rating_count >= 3 && c.rating_avg != null)
    .map((c) => Number(c.rating_avg));
  const rosterMedianRating =
    ratedEnough.length > 0 ? median(ratedEnough) : DEFAULT_ROSTER_MEDIAN_RATING;

  const results: ScoredCaregiver[] = pool
    .map((c) => {
      const primary = c.areas.find((a) => a.isPrimary)?.area ?? null;
      const others = c.areas.filter((a) => !a.isPrimary).map((a) => a.area);
      const distanceKm = distanceById.get(c.staff_profile_id);
      // CareLink's finalized fixed-rate model: budget fit is scored
      // against the real CareLink rate for this caregiver's type, never
      // their own staff_profiles.hourly_rate (a stale, no-longer-priced
      // field for new bookings). A caregiver with no declared type yet
      // has no fixed rate to score against — falls back to their
      // legacy hourly_rate so they aren't excluded from matching outright.
      const effectiveRate = c.caregiver_type ? hourlyRateFor(c.caregiver_type) : c.hourly_rate;

      const { score, breakdown } = computeMatchScore(weights, {
        area:
          distanceKm != null
            ? computeProximityFit(distanceKm)
            : computeAreaFit(query.area ?? null, primary, others),
        skills: computeSkillFit(query.skills ?? [], c.skills ?? []),
        // No budget filter exists on this search any more — every
        // caregiver costs the same fixed CareLink rate, so there is
        // nothing left for a parent-specified ceiling to mean. Passing
        // null keeps this scoring dimension neutral (always 1) rather
        // than removing it outright, since match_weights.budget is
        // still a real, admin-configurable weight elsewhere.
        budget: computeBudgetFit(effectiveRate, null),
        ratingExperience: computeRatingExperienceFit(
          c.rating_avg != null ? Number(c.rating_avg) : null,
          c.rating_count,
          rosterMedianRating,
          c.years_experience ?? 0,
        ),
        availability: computeAvailabilityFit(720),
      });

      // Rounded to one decimal — a real, derived number (never a raw
      // coordinate), safe to show a parent per the location system's
      // own privacy rule; null when no distance could be computed.
      const distanceKmRounded = distanceKm != null ? Math.round(distanceKm * 10) / 10 : null;
      return { ...c, matchScore: score, matchBreakdown: breakdown, distanceKm: distanceKmRounded };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return { results: results.slice(0, MAX_RESULTS), emptyState: null };
}

export async function loadMatchWeights(supabase: SupabaseClient): Promise<MatchWeights> {
  const { data: weightRows, error } = await supabase.from("match_weights").select("factor, weight");
  if (error) throw error;
  const weightMap = Object.fromEntries((weightRows ?? []).map((r) => [r.factor, Number(r.weight)]));
  return {
    availability: weightMap.availability ?? 0.3,
    area: weightMap.area ?? 0.25,
    skills: weightMap.skills ?? 0.2,
    ratingExperience: weightMap.rating_experience ?? 0.15,
    budget: weightMap.budget ?? 0.1,
  };
}
