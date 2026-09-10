import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateTotalAmount, createCareRequestSchema, sessionCountFor } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";

// Creates a care_requests row — a structured, storable record of what a
// parent asked for (via CareLink AI or the direct Nanny/Babysitter
// form), confirmed before any search runs. This route never searches or
// scores a caregiver itself: the frontend still calls the existing
// GET /api/search/caregivers with the same filters afterward. The one
// real rule this route enforces server-side, independent of the
// frontend or the AI layer: no resolved, map-verified service location,
// no row — createCareRequestSchema requires serviceLatitude/
// serviceLongitude and locationResolved === true together, so a
// request with only a typed area name (no real coordinates) fails
// validation with 400 here, exactly as it would with no location at
// all.
//
// CareLink's finalized fixed-rate model: session_count and total_amount
// are always computed here, from the caregiver type and the real
// recurrence pattern — never accepted from the client. total_amount on
// this row is the WHOLE series' informational total; the one real
// booking dispatch later creates from this request is priced
// separately, for exactly one session (see lib/services/dispatch.ts).
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

    // A light existence check only — real eligibility (date/time/
    // schedule conflicts/service area) is checked for real when dispatch
    // actually tries this caregiver (lib/services/dispatch.ts), never
    // here. The caregiver just has to exist and be bookable
    // (public_caregivers already means verified + accepting). Type is
    // no longer matched: CareLink presents every caregiver as a Nanny,
    // so a caregiver whose stored caregiver_type is a historical
    // "babysitter" (or not set yet) is still a valid preferred choice.
    if (body.preferredStaffProfileId) {
      const { data: preferred, error: preferredErr } = await supabase
        .from("public_caregivers")
        .select("staff_profile_id")
        .eq("staff_profile_id", body.preferredStaffProfileId)
        .maybeSingle();
      if (preferredErr) return NextResponse.json({ error: preferredErr.message }, { status: 500 });
      if (!preferred) {
        return NextResponse.json(
          { error: "That caregiver isn't available as a preferred choice for this request" },
          { status: 400 },
        );
      }
    }

    // Duration and session count, both computed from real inputs — never
    // trusted from the client — feeding the one authoritative price
    // formula (see packages/shared/src/pricing.ts).
    const startsAt = new Date(`${body.date}T${body.startTime}:00Z`);
    const endsAt = new Date(`${body.date}T${body.endTime}:00Z`);
    const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
    const sessionCount = sessionCountFor(
      body.repeatMode,
      body.repeatWeekdays,
      body.repeatStartDate ?? null,
      body.repeatEndDate ?? null,
    );
    if (sessionCount < 1) {
      return NextResponse.json(
        {
          error:
            "The chosen day(s) don't fall within your start and end date — pick a wider range.",
        },
        { status: 400 },
      );
    }
    const totalAmount = calculateTotalAmount(body.caregiverType, durationHours, sessionCount);

    const { data: careRequest, error: insertErr } = await supabase
      .from("care_requests")
      .insert({
        parent_profile_id: parentProfileId,
        ward_id: body.wardId ?? null,
        preferred_staff_profile_id: body.preferredStaffProfileId ?? null,
        source: body.source,
        caregiver_type: body.caregiverType,
        date: body.date,
        start_time: body.startTime,
        end_time: body.endTime,
        location: body.location,
        service_address: body.serviceAddress,
        service_latitude: body.serviceLatitude,
        service_longitude: body.serviceLongitude,
        location_place_id: body.locationPlaceId ?? null,
        location_source: body.locationSource,
        location_resolved: body.locationResolved,
        skills: body.skills ?? [],
        notes: body.notes ?? null,
        ai_recommendation: body.aiRecommendation ?? null,
        ai_recommendation_reason: body.aiRecommendationReason ?? null,
        confirmed_at: new Date().toISOString(),
        repeat_mode: body.repeatMode,
        repeat_weekdays: body.repeatWeekdays,
        repeat_start_date: body.repeatStartDate ?? null,
        repeat_end_date: body.repeatEndDate ?? null,
        session_count: sessionCount,
        total_amount: totalAmount,
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
