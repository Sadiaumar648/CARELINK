import Anthropic from "@anthropic-ai/sdk";
import type { CareRequestDraft } from "@carelink/shared";

// The multi-turn counterpart to lib/services/nl-search.ts's single-shot
// search parser — same provider, same model, same "AI output is
// untrusted input" defensive-parsing discipline, but carrying a
// conversation instead of one message. Now that Nanny and Babysitter
// are merged into one "Nanny" concept for parents, Nia's job is no
// longer to recommend between the two — it's a general care assistant
// that helps a parent describe what they need in plain language. It
// never talks to the matching engine, never picks a caregiver, never
// searches, and never books anything, and — same rule as always — it
// never prefills the request form's location, even if a parent mentions
// one in conversation. The parent always finishes on the same
// structured request form (RequestFlowPanel) the direct "Find Care"
// entry point uses; `draft` is only ever a convenience, letting that
// form arrive pre-filled with whatever the parent already volunteered
// here (care needs, timing, notes — never location).

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type CareAssistantResult = {
  reply: string;
  draft: CareRequestDraft;
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

// Left in the response for now as a harmless, honestly-computed signal
// (never trusted from the model's JSON) — the frontend's own in-chat
// confirm/dispatch flow that once consumed this has been retired in
// favour of always handing off to the real request form, so nothing
// currently reads this field, but removing it isn't necessary either.
function readyToConfirmFrom(draft: CareRequestDraft): boolean {
  return Boolean(
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
    "You are Nia, CareLink's warm assistant for a Ghanaian childcare marketplace. " +
    "Your job is to help a parent describe, in plain conversational language, the care they need — " +
    "a natural conversation, never a rigid form, never more than one question at a time. Every " +
    "caregiver on CareLink is presented to parents simply as a Nanny, so you never ask a parent to " +
    "choose between a Nanny and a Babysitter, and you never mention that distinction at all. " +
    "You are NOT a general-purpose chatbot, and you never search for caregivers, pick a specific " +
    "caregiver, check availability, or book anything yourself — CareLink's own matching happens " +
    "afterwards, once the parent continues to the real request form. You may briefly explain how " +
    "CareLink works if asked, but never invent features or policies. " +
    "\n\nAlong the way, if the parent volunteers any of these naturally, capture them so the real " +
    "request form can arrive pre-filled afterwards (never ask about them just to fill this in — only " +
    "record what's actually mentioned): who needs care (a ward name and/or age), a date, a start and " +
    "end time, the care location (an area or neighbourhood — captured here for your own context only; " +
    "it is never carried onto the request form, which always requires the parent's own exact GPS " +
    "location), and specific care needs from this exact fixed list: infant_care, toddler_care, " +
    "school_age_supervision, newborn_care, meal_preparation, special_needs_care, light_housekeeping. " +
    "\n\nWhat's already known from this conversation: " +
    known +
    `. Today's date is ${today}; resolve relative dates ("this Saturday", "tomorrow") against it. ` +
    "Never ask again for a field already present above. Once you have a reasonable picture of what " +
    "the parent needs, tell them so in your reply and let them know they can continue to the request " +
    "form whenever they're ready. " +
    "\n\nRespond with raw JSON only — no other text, no markdown code fences — in this exact shape: " +
    '{"reply": "<one short, warm, natural sentence — your next question, or a summary once you know ' +
    'enough>", "draft": {<the FULL cumulative set of details volunteered so far, merging the known ' +
    "fields above with anything new this turn, using keys from exactly: wardAgeYears, wardName, date, " +
    "startTime, endTime, location, skills, notes>}}"
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
      readyToConfirm: readyToConfirmFrom(draft),
    };
  } catch {
    return null;
  }
}

// ── "Help me pick" — Nia choosing from a concrete caregiver list ──────
// A separate, single-shot job from the conversation above: the parent is
// already looking at the real, eligible caregiver list CareLink produced
// for their request, and isn't sure which one to pick. They describe
// what matters to them; Nia recommends exactly ONE caregiver from the
// list, by id, with a one-sentence reason. It never invents a caregiver,
// never searches, never books — the recommendation is advice the parent
// still acts on themselves by pressing Request. The returned id is
// validated against the candidate list by the caller before it's
// trusted.

export type CaregiverCandidateForPick = {
  staffProfileId: string;
  fullName: string;
  yearsExperience: number | null;
  ratingAvg: number | null;
  ratingCount: number;
  bio: string | null;
  skills: string[];
  primaryArea: string | null;
};

export type CaregiverPick = { staffProfileId: string; reason: string };

export async function recommendCaregiverFromList(
  message: string,
  candidates: CaregiverCandidateForPick[],
): Promise<CaregiverPick | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || candidates.length === 0) return null;

  const client = new Anthropic({ apiKey, timeout: 20000, maxRetries: 1 });
  const validIds = new Set(candidates.map((c) => c.staffProfileId));

  const roster = candidates
    .map((c, i) => {
      const rating =
        c.ratingAvg != null
          ? `${c.ratingAvg.toFixed(1)}★ (${c.ratingCount} reviews)`
          : "no reviews yet";
      const exp =
        c.yearsExperience != null ? `${c.yearsExperience} yrs experience` : "experience not stated";
      const skills = c.skills.length ? `skills: ${c.skills.join(", ")}` : "no listed skills";
      return `${i + 1}. id=${c.staffProfileId} — ${c.fullName}; ${exp}; ${rating}; ${c.primaryArea ?? "area not stated"}; ${skills}${c.bio ? `; bio: ${c.bio.slice(0, 240)}` : ""}`;
    })
    .join("\n");

  const system =
    "You are Nia, CareLink's warm assistant for a Ghanaian childcare marketplace. " +
    "A parent is looking at this exact list of verified, available caregivers (Nannies) that " +
    "CareLink already matched to their request, and isn't sure who to pick. Based only on what " +
    "the parent tells you and the facts in this list, recommend EXACTLY ONE caregiver from the " +
    "list. Never invent a caregiver or a fact about one; never suggest searching again or booking " +
    "— the parent presses Request themselves. If the parent's note doesn't clearly favour anyone, " +
    "pick the strongest all-round match and say so plainly.\n\nThe caregivers:\n" +
    roster +
    "\n\nRespond with raw JSON only — no markdown, no other text — in this exact shape: " +
    '{"staffProfileId": "<the id, copied exactly from the list>", "reason": "<one short, warm sentence naming the caregiver and why they fit>"}';

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system,
      messages: [{ role: "user", content: message.slice(0, 1000) }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const parsed: unknown = JSON.parse(extractJsonText(textBlock?.text ?? ""));
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    if (
      typeof p.staffProfileId === "string" &&
      validIds.has(p.staffProfileId) &&
      typeof p.reason === "string" &&
      p.reason.trim()
    ) {
      return { staffProfileId: p.staffProfileId, reason: p.reason.trim().slice(0, 400) };
    }
    return null;
  } catch {
    return null;
  }
}
