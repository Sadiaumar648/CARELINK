import { NextResponse } from "next/server";
import { z } from "zod";
import { calculateTotalAmount, createCareRequestSchema, sessionCountFor } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";
import { findEligibleCaregivers, loadMatchWeights } from "@/lib/services/caregiver-search";

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

    // One or more children, first = primary. `wardIds` from the Request
    // a Nanny form wins; `wardId` is the fallback for the AI flow.
    const wardIds = (
      body.wardIds && body.wardIds.length > 0 ? body.wardIds : body.wardId ? [body.wardId] : []
    ).filter((id, i, all) => all.indexOf(id) === i);

    if (wardIds.length > 0) {
      // wards RLS already scopes SELECT to the parent's own children, so
      // .in() only returns ids they actually own — a count mismatch
      // means one of the ids isn't theirs (or doesn't exist).
      const { data: ownedWards, error: wardErr } = await supabase
        .from("wards")
        .select("id")
        .in("id", wardIds);
      if (wardErr) return NextResponse.json({ error: wardErr.message }, { status: 500 });
      if ((ownedWards?.length ?? 0) !== wardIds.length) {
        return NextResponse.json(
          { error: "One of the selected children wasn't found" },
          {
            status: 404,
          },
        );
      }
    }

    // The nanny the parent picked from Recommended Nannies must still be
    // eligible for this exact slot at the moment they press Send Request
    // — even though they were recommended a moment ago. This runs the
    // same check the Recommended Nannies list used to produce them
    // (public_caregivers membership = active + CareLink-verified +
    // accepting, plus a conflicts-only availability check = no clashing
    // booking, no marked-unavailable date). If they've since become
    // unavailable, the request is NOT created — the parent is sent back
    // to Recommended Nannies to pick someone else.
    if (body.preferredStaffProfileId) {
      const weights = await loadMatchWeights(supabase);
      const eligible = await findEligibleCaregivers(
        supabase,
        {
          latitude: body.serviceLatitude,
          longitude: body.serviceLongitude,
          date: body.date,
          startTime: body.startTime,
          endTime: body.endTime,
          durationDays: body.durationDays,
        },
        weights,
        { availabilityCheck: "conflicts" },
      );
      if (!eligible.results.some((r) => r.staff_profile_id === body.preferredStaffProfileId)) {
        return NextResponse.json(
          {
            error:
              "This nanny is no longer available for your selected time. Please choose another nanny.",
            code: "nanny_unavailable",
          },
          { status: 400 },
        );
      }
    }

    // Duration, day count and child count — all from real inputs, never
    // trusted from the client — feeding the one authoritative price
    // formula (see packages/shared/src/pricing.ts). startsAt/endsAt
    // describe day one's window; durationDays is how many consecutive
    // days it runs. total_amount is the whole engagement.
    const startsAt = new Date(`${body.date}T${body.startTime}:00Z`);
    const endsAt = new Date(`${body.date}T${body.endTime}:00Z`);
    const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
    const durationDays = body.durationDays;
    // sessionCountFor still runs (repeat_mode defaults to "once" → 1) so
    // the legacy repeat columns stay internally consistent; the real
    // "how many sessions" figure for pricing and the stored
    // session_count is durationDays now.
    const repeatSessionCount = sessionCountFor(
      body.repeatMode,
      body.repeatWeekdays,
      body.repeatStartDate ?? null,
      body.repeatEndDate ?? null,
    );
    if (repeatSessionCount < 1) {
      return NextResponse.json(
        {
          error:
            "The chosen day(s) don't fall within your start and end date — pick a wider range.",
        },
        { status: 400 },
      );
    }
    const totalAmount = calculateTotalAmount(
      body.caregiverType,
      durationHours,
      durationDays,
      wardIds.length || 1,
    );

    const { data: careRequest, error: insertErr } = await supabase
      .from("care_requests")
      .insert({
        parent_profile_id: parentProfileId,
        ward_id: wardIds[0] ?? null,
        ward_ids: wardIds,
        preferred_staff_profile_id: body.preferredStaffProfileId ?? null,
        source: body.source,
        caregiver_type: body.caregiverType,
        date: body.date,
        start_time: body.startTime,
        end_time: body.endTime,
        duration_days: durationDays,
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
        session_count: durationDays,
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
