import { NextResponse } from "next/server";
import { z } from "zod";
import { createCareRequestSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";

// Creates a care_requests row — a structured, storable record of what a
// parent asked for (via CareLink AI or the direct Nanny/Babysitter
// form), confirmed before any search runs. This route never searches or
// scores a caregiver itself: the frontend still calls the existing
// GET /api/search/caregivers with the same filters afterward. The one
// real rule this route enforces server-side, independent of the
// frontend or the AI layer: no location, no row — createCareRequestSchema
// requires it, so a missing location fails validation with 400 here.
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);

    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    if (!parentProfileId) {
      return NextResponse.json({ error: "Complete your household profile first" }, { status: 400 });
    }

    const body = createCareRequestSchema.parse(await request.json());

    if (body.wardId) {
      const { data: ward, error: wardErr } = await supabase
        .from("wards")
        .select("id")
        .eq("id", body.wardId)
        .maybeSingle();
      if (wardErr) return NextResponse.json({ error: wardErr.message }, { status: 500 });
      if (!ward) return NextResponse.json({ error: "Ward not found" }, { status: 404 });
    }

    const { data: careRequest, error: insertErr } = await supabase
      .from("care_requests")
      .insert({
        parent_profile_id: parentProfileId,
        ward_id: body.wardId ?? null,
        source: body.source,
        caregiver_type: body.caregiverType,
        date: body.date,
        start_time: body.startTime,
        end_time: body.endTime,
        location: body.location,
        skills: body.skills ?? [],
        notes: body.notes ?? null,
        ai_recommendation: body.aiRecommendation ?? null,
        ai_recommendation_reason: body.aiRecommendationReason ?? null,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
    return NextResponse.json({ careRequest }, { status: 201 });
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
