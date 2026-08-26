import Anthropic from "@anthropic-ai/sdk";

// Task 4.2. Advisory only — the administrator's decision is the only
// thing that changes verification status (doc 1, PRD, F4). A malformed
// model response is recorded as "uncertain", never guessed (doc 2,
// Technical Design, §6.2); total provider failure returns null so the
// caller can hide the feature entirely rather than block verification.

export type PhotoVerdict = "likely_match" | "uncertain" | "likely_mismatch";
const VERDICTS: PhotoVerdict[] = ["likely_match", "uncertain", "likely_mismatch"];

export type PhotoCheckResult = { verdict: PhotoVerdict; rationale: string; modelVersion: string };

const MODEL = "claude-opus-5";

const SYSTEM_PROMPT =
  'You compare an identity document photo against a live selfie and give a plausibility opinion — never a certified biometric match. Respond with raw JSON only — no other text, no markdown code fences: {"verdict": "likely_match" | "uncertain" | "likely_mismatch", "rationale": "one short sentence"}.';

// Models routinely wrap JSON in a markdown code fence despite an
// explicit "JSON only" instruction — defensive parsing, not just a
// prompt tweak, per the "AI output is untrusted input" principle.
function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

export function parseVerdictResponse(
  raw: string,
): { verdict: PhotoVerdict; rationale: string } | null {
  try {
    const parsed = JSON.parse(extractJsonText(raw));
    if (
      parsed &&
      typeof parsed === "object" &&
      VERDICTS.includes(parsed.verdict) &&
      typeof parsed.rationale === "string" &&
      parsed.rationale.length > 0
    ) {
      return { verdict: parsed.verdict, rationale: parsed.rationale };
    }
  } catch {
    // falls through to null
  }
  return null;
}

export async function checkPhotoPlausibility(
  idImageBase64: string,
  idMediaType: string,
  selfieImageBase64: string,
  selfieMediaType: string,
): Promise<PhotoCheckResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const client = new Anthropic({ apiKey, timeout: 20000, maxRetries: 1 });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: idMediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: idImageBase64,
              },
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: selfieMediaType as
                  "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: selfieImageBase64,
              },
            },
            {
              type: "text",
              text: "The first image is an ID document photo; the second is a live selfie. Does the selfie plausibly show the same person as the ID photo?",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    const parsed = parseVerdictResponse(textBlock?.text ?? "");
    if (!parsed) {
      return {
        verdict: "uncertain",
        rationale: "Model response could not be parsed",
        modelVersion: MODEL,
      };
    }
    return { ...parsed, modelVersion: MODEL };
  } catch (error) {
    console.error("[photo-check] DEBUG failure:", error);
    return null;
  }
}
