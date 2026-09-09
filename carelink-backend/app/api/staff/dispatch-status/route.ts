import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// "Location Sharing" (CareLink location system, Part 4 — this route's
// underlying mechanism is unchanged; only its meaning was narrowed).
// Deliberately separate from staff_profiles.accepting_bookings
// (/api/staff/accepting-bookings — "Receiving requests", what actually
// gates eligibility now). Turning location sharing on/off no longer
// makes or unmakes a caregiver dispatch-eligible — dispatch.ts stopped
// requiring it — it only improves proximity accuracy: a live fix here
// is preferred over the caregiver's static base location when both
// exist (see nearby_caregiver_distances' coalesce).
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const { data: profile, error: profileErr } = await supabase
      .from("staff_profiles")
      .select("id, dispatch_available")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
    if (!profile) return NextResponse.json({ available: false, updatedAt: null });

    const { data: location } = await supabase
      .from("staff_dispatch_locations")
      .select("updated_at")
      .eq("staff_profile_id", profile.id)
      .maybeSingle();

    return NextResponse.json({
      available: profile.dispatch_available,
      updatedAt: location?.updated_at ?? null,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

const bodySchema = z.discriminatedUnion("available", [
  z.object({
    available: z.literal(true),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  z.object({ available: z.literal(false) }),
]);

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const body = bodySchema.parse(await request.json());

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("verification_status")
      .eq("id", userId)
      .single();
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });
    if (user.verification_status !== "verified") {
      return NextResponse.json(
        { error: "Complete identity verification before going available for dispatch" },
        { status: 403 },
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("staff_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 });
    if (!profile) {
      return NextResponse.json({ error: "Complete your caregiver profile first" }, { status: 400 });
    }

    if (body.available) {
      const { error: locErr } = await supabase.from("staff_dispatch_locations").upsert(
        {
          staff_profile_id: profile.id,
          latitude: body.latitude,
          longitude: body.longitude,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "staff_profile_id" },
      );
      if (locErr) return NextResponse.json({ error: locErr.message }, { status: 400 });
    } else {
      // Going off duty deletes the location row outright — the same
      // "no location history" stance SafeTrack already takes, not just
      // a status flip that leaves a stale fix sitting in the table.
      await supabase.from("staff_dispatch_locations").delete().eq("staff_profile_id", profile.id);
    }

    const { error: updateErr } = await supabase
      .from("staff_profiles")
      .update({ dispatch_available: body.available })
      .eq("id", profile.id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    return NextResponse.json({ available: body.available });
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
