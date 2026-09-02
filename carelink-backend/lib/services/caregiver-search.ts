import type { SupabaseClient } from "@supabase/supabase-js";
import type { SearchCaregiversQuery } from "@carelink/shared";
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
  // Dispatch-only: neither param is set by the existing search route.
  caregiverType?: "nanny" | "babysitter";
  excludeStaffProfileIds?: string[];
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
  if (query.minExperience != null) {
    applyFilter(
      "minExperience",
      "Try lowering the minimum experience.",
      (c) => (c.years_experience ?? 0) >= query.minExperience!,
    );
  }
  if (query.budgetCeiling != null) {
    applyFilter(
      "budgetCeiling",
      "Try raising the budget.",
      (c) => c.hourly_rate <= query.budgetCeiling!,
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

  let requestedRange: { starts: Date; ends: Date } | null = null;
  if (query.date && query.startTime && query.endTime) {
    requestedRange = {
      starts: new Date(`${query.date}T${query.startTime}:00Z`),
      ends: new Date(`${query.date}T${query.endTime}:00Z`),
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

    applyFilter("availability", "Try a different time or date.", (c) => {
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
      ).available;
    });
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

      const { score, breakdown } = computeMatchScore(weights, {
        area: computeAreaFit(query.area ?? null, primary, others),
        skills: computeSkillFit(query.skills ?? [], c.skills ?? []),
        budget: computeBudgetFit(c.hourly_rate, query.budgetCeiling ?? null),
        ratingExperience: computeRatingExperienceFit(
          c.rating_avg != null ? Number(c.rating_avg) : null,
          c.rating_count,
          rosterMedianRating,
          c.years_experience ?? 0,
        ),
        availability: computeAvailabilityFit(720),
      });

      return { ...c, matchScore: score, matchBreakdown: breakdown };
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
