import { parseVerdictResponse } from "../lib/services/photo-check";
import { sanitizeParsedFilters } from "../lib/services/nl-search";

// Pure-function unit tests for tasks 4.2 and 4.4 — no API calls. These
// exercise exactly the "malformed response" and "unknown/out-of-range
// field" handling the docs require, without depending on the model
// actually producing bad output on demand.

describe("parseVerdictResponse (task 4.2)", () => {
  it("accepts a well-formed verdict", () => {
    expect(
      parseVerdictResponse('{"verdict": "likely_match", "rationale": "Consistent features"}'),
    ).toEqual({
      verdict: "likely_match",
      rationale: "Consistent features",
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseVerdictResponse("not json at all")).toBeNull();
  });

  it("returns null for a verdict outside the enum", () => {
    expect(
      parseVerdictResponse('{"verdict": "definitely_the_same_person", "rationale": "x"}'),
    ).toBeNull();
  });

  it("returns null when rationale is missing", () => {
    expect(parseVerdictResponse('{"verdict": "uncertain"}')).toBeNull();
  });

  it("returns null for JSON that isn't an object", () => {
    expect(parseVerdictResponse('"likely_match"')).toBeNull();
  });

  it("strips a markdown code fence before parsing — models add these despite instructions not to", () => {
    const fenced =
      '```json\n{"verdict": "uncertain", "rationale": "Lighting makes comparison hard"}\n```';
    expect(parseVerdictResponse(fenced)).toEqual({
      verdict: "uncertain",
      rationale: "Lighting makes comparison hard",
    });
  });
});

describe("sanitizeParsedFilters (task 4.4)", () => {
  it("keeps well-formed fields", () => {
    expect(
      sanitizeParsedFilters({
        area: "Tema",
        skills: ["toddler_care"],
        budgetCeiling: 30,
        minExperience: 2,
      }),
    ).toEqual({ area: "Tema", skills: ["toddler_care"], budgetCeiling: 30, minExperience: 2 });
  });

  it("drops an unknown skill and keeps valid ones", () => {
    expect(sanitizeParsedFilters({ skills: ["toddler_care", "made_up_skill"] })).toEqual({
      skills: ["toddler_care"],
    });
  });

  it("drops an out-of-range budget", () => {
    expect(sanitizeParsedFilters({ budgetCeiling: -5 })).toEqual({});
    expect(sanitizeParsedFilters({ budgetCeiling: "thirty" })).toEqual({});
  });

  it("drops a malformed date", () => {
    expect(sanitizeParsedFilters({ date: "next Tuesday" })).toEqual({});
  });

  it("keeps a complete date+start+end trio", () => {
    expect(
      sanitizeParsedFilters({ date: "2027-01-04", startTime: "14:00", endTime: "18:00" }),
    ).toEqual({ date: "2027-01-04", startTime: "14:00", endTime: "18:00" });
  });

  it("drops an incomplete time window (missing date)", () => {
    expect(sanitizeParsedFilters({ startTime: "14:00", endTime: "18:00" })).toEqual({});
  });

  it("drops an incomplete time window (only startTime)", () => {
    expect(sanitizeParsedFilters({ date: "2027-01-04", startTime: "14:00" })).toEqual({
      date: "2027-01-04",
    });
  });

  it("returns an empty object for non-object input", () => {
    expect(sanitizeParsedFilters(null)).toEqual({});
    expect(sanitizeParsedFilters("a string")).toEqual({});
    expect(sanitizeParsedFilters(42)).toEqual({});
  });

  it("returns an empty object for a completely empty response", () => {
    expect(sanitizeParsedFilters({})).toEqual({});
  });
});
