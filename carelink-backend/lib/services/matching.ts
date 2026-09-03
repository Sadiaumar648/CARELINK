// Task 2.7. The soft-score half of matching, run only on candidates that
// already survived the hard filter (task 2.6) — not verified, wrong
// area, unavailable and already-booked candidates never reach here.
// Every factor here is a pure function of its inputs so it can be unit
// tested against fixture rosters, per the Engineering Plan's acceptance
// criteria for this task.

export type MatchWeights = {
  availability: number;
  area: number;
  skills: number;
  ratingExperience: number;
  budget: number;
};

export type MatchBreakdown = {
  availability: number;
  area: number;
  skills: number;
  ratingExperience: number;
  budget: number;
};

export type MatchResult = {
  score: number;
  breakdown: MatchBreakdown;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Primary area scores full; a secondary declared area scores reduced (doc 5, §4.5). */
export function computeAreaFit(
  requestedArea: string | null,
  primaryArea: string | null,
  otherAreas: string[],
): number {
  if (!requestedArea) return 1;
  const normalized = requestedArea.trim().toLowerCase();
  if (primaryArea && primaryArea.trim().toLowerCase() === normalized) return 1;
  if (otherAreas.some((a) => a.trim().toLowerCase() === normalized)) return 0.6;
  return 0;
}

// CareLink location system, Part 7: real distance, once both the
// request and the caregiver have resolved coordinates. Full score at
// 0km, decaying linearly to 0 at maxRelevantKm — beyond that radius,
// proximity stops meaningfully differentiating candidates for a
// city-scale childcare service. Kept as a separate function from
// computeAreaFit (not a replacement) — see lib/services/
// caregiver-search.ts for how the two combine: proximity is used in
// place of the area string-match only for a candidate that actually
// has a distance computed, so a partially-migrated caregiver roster
// (some with coordinates, some without) never breaks — everyone else
// keeps scoring on computeAreaFit exactly as before.
export function computeProximityFit(distanceKm: number, maxRelevantKm = 20): number {
  return clamp01(1 - distanceKm / maxRelevantKm);
}

/** Proportion of the parent's requested skills the caregiver actually has. */
export function computeSkillFit(requestedSkills: string[], caregiverSkills: string[]): number {
  if (requestedSkills.length === 0) return 1;
  const have = new Set(caregiverSkills);
  const matched = requestedSkills.filter((s) => have.has(s)).length;
  return matched / requestedSkills.length;
}

/** Full score at or under budget; falls off linearly per fraction over it. */
export function computeBudgetFit(hourlyRate: number, budgetCeiling: number | null): number {
  if (budgetCeiling == null) return 1;
  if (hourlyRate <= budgetCeiling) return 1;
  const overBy = (hourlyRate - budgetCeiling) / budgetCeiling;
  return clamp01(1 - overBy);
}

/**
 * Combines rating and experience into one factor (doc 2, Technical
 * Design, §5 groups them as one weighted line). A caregiver with fewer
 * than three reviews scores at the roster median instead of zero, so a
 * new profile isn't permanently unrankable (same section).
 */
export function computeRatingExperienceFit(
  ratingAvg: number | null,
  ratingCount: number,
  rosterMedianRating: number,
  yearsExperience: number,
  experienceCapYears = 10,
): number {
  const effectiveRating = ratingCount < 3 ? rosterMedianRating : (ratingAvg ?? rosterMedianRating);
  const ratingNorm = clamp01(effectiveRating / 5);
  const experienceNorm = clamp01(yearsExperience / experienceCapYears);
  return (ratingNorm + experienceNorm) / 2;
}

/**
 * How much slack the caregiver's declared hours leave around the
 * requested window on the relevant day, relative to a full working day.
 * Candidates reaching this function already passed the hard availability
 * filter (task 2.6) — this only differentiates comfortably-available
 * from just-barely-available.
 */
export function computeAvailabilityFit(
  matchingWindowMinutes: number,
  referenceMaxMinutes = 720,
): number {
  return clamp01(matchingWindowMinutes / referenceMaxMinutes);
}

/** The weighted sum, plus the same per-factor numbers shown to the parent (doc 1, PRD, F5). */
export function computeMatchScore(weights: MatchWeights, factors: MatchBreakdown): MatchResult {
  const breakdown: MatchBreakdown = {
    availability: round2(clamp01(factors.availability) * weights.availability * 100),
    area: round2(clamp01(factors.area) * weights.area * 100),
    skills: round2(clamp01(factors.skills) * weights.skills * 100),
    ratingExperience: round2(clamp01(factors.ratingExperience) * weights.ratingExperience * 100),
    budget: round2(clamp01(factors.budget) * weights.budget * 100),
  };

  const score = round2(
    breakdown.availability +
      breakdown.area +
      breakdown.skills +
      breakdown.ratingExperience +
      breakdown.budget,
  );

  return { score, breakdown };
}
