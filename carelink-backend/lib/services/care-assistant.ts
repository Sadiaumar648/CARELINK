import Anthropic from "@anthropic-ai/sdk";
import type { CareRequestDraft } from "@carelink/shared";

// The multi-turn counterpart to lib/services/nl-search.ts's single-shot
// search parser — same provider, same model, same "AI output is
// untrusted input" defensive-parsing discipline, but carrying a
// conversation instead of one message. This never talks to the matching
// engine and never picks a caregiver: it only ever produces a structured
// draft for the parent to confirm, which — once confirmed via
// POST /api/care-requests — is turned into the exact same
// GET /api/search/caregivers filters the direct Nanny/Babysitter form
// already produces today.

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type CareAssistantResult = {
  reply: string;
  draft: CareRequestDraft;
  recommendation: { type: "nanny" | "babysitter"; reason: string } | null;
  // Recomputed from `draft` by this module, never taken verbatim from
  // the model's own output — see readyToConfirmFrom() below.
  readyToConfirm: boolean;
};

const MODEL = "claude-opus-5";

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

// Models routinely wrap JSON in a markdown code fence despite an
// explicit "JSON only" instruction — defensive parsing, not just a
// prompt tweak, per the "AI output is untrusted input" principle
// (same helper as nl-search.ts and photo-check.ts).
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

function sanitizeDraft(raw: unknown): CareRequestDraft {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: CareRequestDraft = {};

  if (r.caregiverType === "nanny" || r.caregiverType === "babysitter") {
    out.caregiverType = r.caregiverType;
  }
  if (typeof r.wardAgeYears === "number" && r.wardAgeYears >= 0 && r.wardAgeYears <= 17) {
    out.wardAgeYears = r.wardAgeYears;
  }
  if (typeof r.wardName === "string" && r.wardName.trim()) out.wardName = r.wardName.trim();
  if (typeof r.date === "string" && DATE_RE.test(r.date)) out.date = r.date;
  if (typeof r.startTime === "string" && TIME_RE.test(r.startTime)) out.startTime = r.startTime;
  if (typeof r.endTime === "string" && TIME_RE.test(r.endTime)) out.endTime = r.endTime;
  if (typeof r.location === "string" && r.location.trim()) out.location = r.location.trim();
  if (typeof r.notes === "string" && r.notes.trim()) out.notes = r.notes.trim().slice(0, 500);
  if (Array.isArray(r.skills)) {
    const skills = r.skills.filter(
      (s): s is string => typeof s === "string" && SKILL_VALUES.has(s),
    );
    if (skills.length > 0) out.skills = skills as CareRequestDraft["skills"];
  }

  // A time window needs both ends together, same rule as the search
  // filters this eventually becomes.
  if ((out.startTime || out.endTime) && !(out.startTime && out.endTime)) {
    delete out.startTime;
    delete out.endTime;
  }

  return out;
}

function sanitizeRecommendation(
  raw: unknown,
): { type: "nanny" | "babysitter"; reason: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (
    (r.type === "nanny" || r.type === "babysitter") &&
    typeof r.reason === "string" &&
    r.reason.trim()
  ) {
    return { type: r.type, reason: r.reason.trim().slice(0, 500) };
  }
  return null;
}

// The one real backend rule this whole feature exists to enforce: a
// request is never "ready to confirm" without a location, no matter what
// the model claims — computed here, not trusted from the model's JSON.
function readyToConfirmFrom(draft: CareRequestDraft): boolean {
  return Boolean(
    draft.caregiverType &&
    draft.date &&
    draft.startTime &&
    draft.endTime &&
    draft.location &&
    draft.location.trim().length > 0,
  );
}

function buildSystemPrompt(knownDraft: CareRequestDraft | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  const known =
    knownDraft && Object.keys(knownDraft).length > 0 ? JSON.stringify(knownDraft) : "{}";
  return (
    "You are CareLink AI, a warm and efficient caregiving assistant for CareLink, " +
    "a Ghanaian childcare marketplace. You help a parent describe the care they need, " +
    "in a natural conversation — never a rigid form, never more than one question at a time. " +
    "You are NOT a general-purpose chatbot: stay focused on gathering a care request, " +
    "and you may briefly explain how CareLink works if asked, but never invent features or policies. " +
    "\n\nInformation to gather (do not ask again for anything already known below): " +
    "who needs care (a ward name and/or age), the date, a start and end time, " +
    "the care location (an area or neighbourhood — this is REQUIRED, CareLink cannot search without it), " +
    "and optionally specific care needs from this exact fixed list: infant_care, toddler_care, " +
    "school_age_supervision, newborn_care, meal_preparation, special_needs_care, light_housekeeping. " +
    "\n\nWhat's already known from this conversation: " +
    known +
    `. Today's date is ${today}; resolve relative dates ("this Saturday", "tomorrow") against it. ` +
    "Never ask again for a field already present above. " +
    "\n\nOnce you know enough about the situation (roughly: age or context, and either an explicit " +
    "care-type preference or enough detail to judge), recommend Nanny or Babysitter as ADVICE, never a " +
    "decision — Nanny suits regular/ongoing/daily care, Babysitter suits short-term/occasional/one-off care. " +
    "If the parent already stated a type explicitly, respect it and skip the recommendation. " +
    "\n\nRespond with raw JSON only — no other text, no markdown code fences — in this exact shape: " +
    '{"reply": "<one short, warm, natural sentence — your next question, or a confirmation once everything is known>", ' +
    '"draft": {<the FULL cumulative structured request so far, merging the known fields above with anything new this turn, ' +
    "using keys from exactly: caregiverType, wardAgeYears, wardName, date, startTime, endTime, location, skills, notes>}, " +
    '"recommendation": {"type": "nanny"|"babysitter", "reason": "<one short sentence>"} or null if not yet ready to recommend or already explicit}'
  );
}

export async function runCareAssistantTurn(
  history: ChatTurn[],
  knownDraft?: CareRequestDraft,
): Promise<CareAssistantResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, timeout: 20000, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: buildSystemPrompt(knownDraft),
      messages: history.map((turn) => ({ role: turn.role, content: turn.content })),
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const parsed: unknown = JSON.parse(extractJsonText(textBlock?.text ?? ""));
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;

    const draft = sanitizeDraft(p.draft);
    const reply =
      typeof p.reply === "string" && p.reply.trim()
        ? p.reply.trim()
        : "Could you tell me a bit more about the care you need?";

    return {
      reply,
      draft,
      recommendation: sanitizeRecommendation(p.recommendation),
      readyToConfirm: readyToConfirmFrom(draft),
    };
  } catch {
    return null;
  }
}
