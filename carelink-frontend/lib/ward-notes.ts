// wards.general_notes has no structured columns for care stage, care
// needs, or activities — those are collected as chips in the UI (parent
// onboarding, and this Edit form) and composed into this one existing
// free-text column in a fixed "Label: a, b." format, then parsed back out
// here for display. If a ward's notes don't match the format (an older
// profile, or something typed freehand), everything falls into `other`
// rather than being silently dropped.
export type ParsedWardNotes = {
  careStage: string | null;
  careNeeds: string[];
  activities: string[];
  other: string | null;
};

function splitList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseWardGeneralNotes(generalNotes: string | null | undefined): ParsedWardNotes {
  if (!generalNotes) return { careStage: null, careNeeds: [], activities: [], other: null };

  const stageMatch = generalNotes.match(/Care stage:\s*([^.]+)\./);
  const needsMatch = generalNotes.match(/Care needs:\s*([^.]+)\./);
  const activitiesMatch = generalNotes.match(/Activities:\s*([^.]+)\./);

  let remainder = generalNotes;
  for (const m of [stageMatch, needsMatch, activitiesMatch]) {
    if (m) remainder = remainder.replace(m[0], "");
  }
  remainder = remainder.trim();

  return {
    careStage: stageMatch ? stageMatch[1].trim() : null,
    careNeeds: needsMatch ? splitList(needsMatch[1]) : [],
    activities: activitiesMatch ? splitList(activitiesMatch[1]) : [],
    other: remainder || null,
  };
}

export function serializeWardGeneralNotes(input: {
  careStage: string | null;
  careNeeds: string[];
  activities: string[];
  other: string | null;
}): string | undefined {
  const parts: string[] = [];
  if (input.careStage) parts.push(`Care stage: ${input.careStage}.`);
  if (input.careNeeds.length) parts.push(`Care needs: ${input.careNeeds.join(", ")}.`);
  if (input.activities.length) parts.push(`Activities: ${input.activities.join(", ")}.`);
  if (input.other?.trim()) parts.push(input.other.trim());
  return parts.length ? parts.join(" ") : undefined;
}

export const CARE_STAGE_LABELS: Record<string, string> = {
  infant: "Infant",
  toddler: "Toddler",
  preschool: "Preschool",
  school_age: "School-age",
};
