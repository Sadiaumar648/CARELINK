import { NextResponse } from "next/server";
import { z } from "zod";
import { searchCaregiversQuerySchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { findEligibleCaregivers, loadMatchWeights } from "@/lib/services/caregiver-search";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const url = new URL(request.url);
    const skillsParam = url.searchParams.get("skills");

    const query = searchCaregiversQuerySchema.parse({
      area: url.searchParams.get("area") ?? undefined,
      // Real coordinates for proximity scoring, when the caller has
      // them (the request flow's map-resolved service location). The
      // schema coerces these from strings and requires both or neither.
      latitude: url.searchParams.get("latitude") ?? undefined,
      longitude: url.searchParams.get("longitude") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
      startTime: url.searchParams.get("startTime") ?? undefined,
      endTime: url.searchParams.get("endTime") ?? undefined,
      budgetCeiling: url.searchParams.get("budgetCeiling") ?? undefined,
      minExperience: url.searchParams.get("minExperience") ?? undefined,
      minRating: url.searchParams.get("minRating") ?? undefined,
      skills: skillsParam ? skillsParam.split(",").filter(Boolean) : undefined,
    });

    const weights = await loadMatchWeights(supabase);
    const outcome = await findEligibleCaregivers(supabase, query, weights);

    return NextResponse.json({
      results: outcome.results,
      appliedFilters: query,
      emptyState: outcome.emptyState,
    });
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
