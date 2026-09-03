import { NextResponse } from "next/server";
import { z } from "zod";
import { CARELINK_HOURLY_RATES, hourlyRateFor, staffProfileSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// CareLink's finalized fixed-rate model: staff_profiles.hourly_rate is a
// NOT NULL column kept for historical bookings, but is never set by the
// caregiver anymore. A caregiver with a declared type gets that type's
// fixed CareLink rate, written here, every save. One with no type yet
// (the column can't be left null) gets this safe placeholder — the
// lower of the fixed rates — until they choose a type; it's never shown
// as "their rate" anywhere, since the profile UI only displays a rate
// once a caregiverType is actually selected.
const UNSET_CAREGIVER_TYPE_PLACEHOLDER_RATE = Math.min(...Object.values(CARELINK_HOURLY_RATES));

// Task 2.1. staff_profiles doesn't exist until the caregiver's first
// save, so PATCH upserts on user_id rather than requiring a prior row.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ profile: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const body = staffProfileSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("staff_profiles")
      .upsert(
        {
          user_id: userId,
          bio: body.bio ?? null,
          caregiver_type: body.caregiverType ?? null,
          years_experience: body.yearsExperience,
          hourly_rate: body.caregiverType
            ? hourlyRateFor(body.caregiverType)
            : UNSET_CAREGIVER_TYPE_PLACEHOLDER_RATE,
          languages: body.languages,
          emergency_contact_name: body.emergencyContactName,
          emergency_contact_phone: body.emergencyContactPhone,
          base_address: body.baseAddress ?? null,
          base_latitude: body.baseLatitude ?? null,
          base_longitude: body.baseLongitude ?? null,
          base_place_id: body.basePlaceId ?? null,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ profile: data });
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
