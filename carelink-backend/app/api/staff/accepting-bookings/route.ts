import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// "Pause new requests" / "Resume new requests" — the caregiver's own
// control over staff_profiles.accepting_bookings, alongside the
// existing admin-only PATCH /api/admin/roster/[staffProfileId] (which
// still works exactly as before, unaffected). Previously only an admin
// could flip this column; a caregiver now can too, for themselves only.
//
// This is what actually makes a caregiver reachable by dispatch/search:
// findEligibleCaregivers already reads accepting_bookings on
// public_caregivers, and dispatch.ts no longer separately requires
// staff_profiles.dispatch_available (that flag now only drives real-time
// location sharing, not eligibility — see /api/staff/dispatch-status).
// accepting_bookings defaults to true at profile creation, so a newly
// onboarded, verified caregiver is reachable with no action needed;
// this route is only ever the caregiver choosing to pause or resume.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) return NextResponse.json({ acceptingBookings: true });

    const { data, error } = await supabase
      .from("staff_profiles")
      .select("accepting_bookings")
      .eq("id", staffProfileId)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ acceptingBookings: data.accepting_bookings });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

const patchSchema = z.object({ acceptingBookings: z.boolean() });

export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const body = patchSchema.parse(await request.json());
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your caregiver profile first" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("staff_profiles")
      .update({ accepting_bookings: body.acceptingBookings })
      .eq("id", staffProfileId)
      .select("accepting_bookings")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ acceptingBookings: data.accepting_bookings });
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
