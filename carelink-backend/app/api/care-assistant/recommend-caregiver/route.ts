import { NextResponse } from "next/server";
import { z } from "zod";
import { recommendCaregiverSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { recommendCaregiverFromList } from "@/lib/services/care-assistant";

// "Ask Nia to help me pick" on the Request a Nanny caregiver list. The
// parent describes what matters to them; Nia recommends exactly one
// caregiver from the list the client sends (the same list on their
// screen). Stateless and advisory only — this route never searches,
// scores, or books; the parent still presses Request themselves. The
// returned id is re-validated against the sent list inside
// recommendCaregiverFromList before it comes back.
export async function POST(request: Request) {
  try {
    await requireRole(request, ["parent"]);
    const body = recommendCaregiverSchema.parse(await request.json());

    const pick = await recommendCaregiverFromList(
      body.message,
      body.candidates.map((c) => ({
        staffProfileId: c.staffProfileId,
        fullName: c.fullName,
        yearsExperience: c.yearsExperience ?? null,
        ratingAvg: c.ratingAvg ?? null,
        ratingCount: c.ratingCount ?? 0,
        bio: c.bio ?? null,
        skills: c.skills ?? [],
        primaryArea: c.primaryArea ?? null,
      })),
    );

    if (!pick) {
      return NextResponse.json(
        {
          error: "Nia couldn't suggest someone just now — pick whoever feels right, or try again.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(pick);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
