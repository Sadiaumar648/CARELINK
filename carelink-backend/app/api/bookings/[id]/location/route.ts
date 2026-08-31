import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// SafeTrack (caregiver safety spec): the caregiver's live location for
// this booking, strictly scoped to an active session. One row per
// booking, latest fix only — see supabase/migrations/
// 20260828000000_caregiver_location_sharing.sql for the table and its
// RLS, which is the real authorization boundary here (a parent or
// caregiver unrelated to this booking, or a booking that isn't active,
// simply gets no row back — this route doesn't need its own ownership
// check on top of that). The explicit status check on POST exists only
// to return a clear 400 instead of an opaque RLS-denied insert.
const upsertLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[id]/location">) {
  try {
    const { supabase } = await requireRole(request, ["parent", "staff", "admin"]);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("caregiver_locations")
      .select("latitude, longitude, updated_at")
      .eq("booking_id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ location: data ?? null });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/location">) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;
    const body = upsertLocationSchema.parse(await request.json());

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (booking.status !== "active") {
      return NextResponse.json(
        { error: "Location sharing is only available during an active session" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("caregiver_locations")
      .upsert({
        booking_id: id,
        latitude: body.latitude,
        longitude: body.longitude,
        updated_at: new Date().toISOString(),
      })
      .select("latitude, longitude, updated_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ location: data });
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

// The caregiver turning SafeTrack off mid-session. Session-end cleanup
// doesn't call this — it deletes the row itself, via the service role,
// in the /end route, so cleanup works no matter which party ends the
// session.
export async function DELETE(request: Request, ctx: RouteContext<"/api/bookings/[id]/location">) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;

    const { error } = await supabase.from("caregiver_locations").delete().eq("booking_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
