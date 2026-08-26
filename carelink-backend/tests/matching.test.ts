import {
  computeAreaFit,
  computeAvailabilityFit,
  computeBudgetFit,
  computeMatchScore,
  computeRatingExperienceFit,
  computeSkillFit,
  type MatchWeights,
} from "../lib/services/matching";

// Task 2.7 — unit tests over fixture data, per the Engineering Plan's own
// acceptance criteria for this task, covering each factor in isolation.

const WEIGHTS: MatchWeights = {
  availability: 0.3,
  area: 0.25,
  skills: 0.2,
  ratingExperience: 0.15,
  budget: 0.1,
};

describe("computeAreaFit", () => {
  it("scores full for the primary area", () => {
    expect(computeAreaFit("Tema", "Tema", [])).toBe(1);
  });
  it("scores reduced for a secondary area", () => {
    expect(computeAreaFit("Adenta", "Tema", ["Adenta"])).toBe(0.6);
  });
  it("scores zero for an undeclared area", () => {
    expect(computeAreaFit("Kumasi", "Tema", ["Adenta"])).toBe(0);
  });
  it("is neutral when the parent didn't filter by area", () => {
    expect(computeAreaFit(null, "Tema", [])).toBe(1);
  });
});

describe("computeSkillFit", () => {
  it("is neutral when no skills were requested", () => {
    expect(computeSkillFit([], ["toddler_care"])).toBe(1);
  });
  it("is the matched proportion of requested skills", () => {
    expect(computeSkillFit(["toddler_care", "meal_preparation"], ["toddler_care"])).toBe(0.5);
  });
  it("is 1 when every requested skill is present", () => {
    expect(computeSkillFit(["toddler_care"], ["toddler_care", "meal_preparation"])).toBe(1);
  });
});

describe("computeBudgetFit", () => {
  it("is neutral with no budget ceiling", () => {
    expect(computeBudgetFit(5000, null)).toBe(1);
  });
  it("is full at or under budget", () => {
    expect(computeBudgetFit(2000, 2500)).toBe(1);
    expect(computeBudgetFit(2500, 2500)).toBe(1);
  });
  it("falls off proportionally over budget", () => {
    expect(computeBudgetFit(3000, 2000)).toBeCloseTo(0.5); // 50% over
  });
  it("never goes below zero for a wildly over-budget rate", () => {
    expect(computeBudgetFit(10000, 1000)).toBe(0);
  });
});

describe("computeRatingExperienceFit", () => {
  it("substitutes the roster median for fewer than three reviews", () => {
    const withFewReviews = computeRatingExperienceFit(5, 1, 3.5, 0);
    const atMedianDirectly = computeRatingExperienceFit(3.5, 5, 3.5, 0);
    expect(withFewReviews).toBeCloseTo(atMedianDirectly);
  });
  it("uses the real rating once there are three or more reviews", () => {
    const highRated = computeRatingExperienceFit(5, 10, 3.5, 0);
    const lowRated = computeRatingExperienceFit(1, 10, 3.5, 0);
    expect(highRated).toBeGreaterThan(lowRated);
  });
  it("caps experience contribution at the cap", () => {
    expect(computeRatingExperienceFit(0, 10, 0, 10)).toBeCloseTo(0.5);
    expect(computeRatingExperienceFit(0, 10, 0, 100)).toBeCloseTo(0.5);
  });
});

describe("computeAvailabilityFit", () => {
  it("scores higher for a wider margin of free time", () => {
    const tight = computeAvailabilityFit(30, 720);
    const roomy = computeAvailabilityFit(600, 720);
    expect(roomy).toBeGreaterThan(tight);
  });
  it("caps at 1 for a full or over-reference day", () => {
    expect(computeAvailabilityFit(720, 720)).toBe(1);
    expect(computeAvailabilityFit(2000, 720)).toBe(1);
  });
});

describe("computeMatchScore", () => {
  it("sums the five weighted contributions to the total, out of 100", () => {
    const { score, breakdown } = computeMatchScore(WEIGHTS, {
      availability: 1,
      area: 1,
      skills: 1,
      ratingExperience: 1,
      budget: 1,
    });
    expect(score).toBe(100);
    expect(
      breakdown.availability +
        breakdown.area +
        breakdown.skills +
        breakdown.ratingExperience +
        breakdown.budget,
    ).toBeCloseTo(100);
  });

  it("ranks a fixture roster in the expected order", () => {
    // Same area and skills for all three; only rating/experience and
    // budget differ, so the ranking should follow those directly.
    const candidates = [
      { name: "Akosua", rating: 4.8, count: 20, years: 6, rate: 2500 },
      { name: "Efua", rating: 3.0, count: 5, years: 1, rate: 1800 },
      { name: "Yaa", rating: 4.0, count: 10, years: 3, rate: 3200 },
    ];
    const results = candidates.map((c) => ({
      name: c.name,
      ...computeMatchScore(WEIGHTS, {
        availability: 1,
        area: 1,
        skills: 1,
        ratingExperience: computeRatingExperienceFit(c.rating, c.count, 3.5, c.years),
        budget: computeBudgetFit(c.rate, 2500),
      }),
    }));

    const order = [...results].sort((a, b) => b.score - a.score).map((r) => r.name);
    expect(order).toEqual(["Akosua", "Yaa", "Efua"]);
  });
});
