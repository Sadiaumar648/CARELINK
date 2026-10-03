import Anthropic from "@anthropic-ai/sdk";

// Task 4.4. Unknown fields are dropped, out-of-range values are dropped
// (doc 2, Technical Design, §6.1) — sanitize() never throws, it just
// keeps what's usable. A parsing failure or provider outage returns
// null; the caller falls back to the manual filter panel either way,
// since search is never blocked by the model (doc 1, PRD, F6).

export type ParsedSearchFilters = {
  area?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  minExperience?: number;
  skills?: string[];
};

const SKILL_VALUES = new Set([
  "infant_care",
  "toddler_care",
  "school_age_supervision",
  "newborn_care",
  "meal_preparation",
  "special_needs_care",
  "light_housekeeping",
]);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function sanitizeParsedFilters(raw: unknown): ParsedSearchFilters {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: ParsedSearchFilters = {};

  if (typeof r.area === "string" && r.area.trim()) out.area = r.area.trim();
  if (typeof r.date === "string" && DATE_RE.test(r.date)) out.date = r.date;
  if (typeof r.startTime === "string" && TIME_RE.test(r.startTime)) out.startTime = r.startTime;
  if (typeof r.endTime === "string" && TIME_RE.test(r.endTime)) out.endTime = r.endTime;
  if (typeof r.minExperience === "number" && r.minExperience >= 0) {
    out.minExperience = Math.round(r.minExperience);
  }
  if (Array.isArray(r.skills)) {
    const skills = r.skills.filter(
      (s): s is string => typeof s === "string" && SKILL_VALUES.has(s),
    );
    if (skills.length > 0) out.skills = skills;
  }

  // A time window needs a date and both ends together — an incomplete
  // trio is dropped rather than sent on to a search that would reject it.
  if ((out.startTime || out.endTime) && !(out.startTime && out.endTime && out.date)) {
    delete out.startTime;
    delete out.endTime;
  }

  return out;
}

const MODEL = "claude-opus-5";

// Models routinely wrap JSON in a markdown code fence despite an
// explicit "JSON only" instruction — defensive parsing, not just a
// prompt tweak, per the "AI output is untrusted input" principle.
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function buildSystemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    "Convert a parent's plain-language caregiver search into structured filters. " +
    "Available fields: area (text), date (YYYY-MM-DD), startTime and endTime (24-hour HH:MM, include both or neither), " +
    "minExperience (years, integer), " +
    "skills (array using exactly these snake_case strings, unchanged: infant_care, toddler_care, school_age_supervision, newborn_care, meal_preparation, special_needs_care, light_housekeeping). " +
    "Every CareLink caregiver costs the same fixed rate — never extract a budget/price field even if the parent mentions a rate; it isn't a real filter. " +
    `Omit any field the parent didn't state. Today's date is ${today}; resolve relative dates against it. ` +
    "Respond with raw JSON only — no other text, no markdown code fences."
  );
}

export async function parseNaturalLanguageSearch(
  query: string,
): Promise<ParsedSearchFilters | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, timeout: 20000, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: buildSystemPrompt(),
      messages: [{ role: "user", content: query }],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const parsed: unknown = JSON.parse(extractJsonText(textBlock?.text ?? ""));
    return sanitizeParsedFilters(parsed);
  } catch {
    return null;
  }
}
