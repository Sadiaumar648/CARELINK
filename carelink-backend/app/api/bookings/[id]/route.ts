import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// Task 2.13 (detail) and 2.14 (care profile attachment). The ward is
// fetched through the same request-scoped client as the booking, so
// row-level security alone decides whether it comes back: the owning
// parent always sees it, and the assigned caregiver sees it only from
// acceptance until closure (the wards_caregiver_via_booking policy checks
// booking status directly) — no extra logic needed here to enforce that.
export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await ctx.params;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

    let ward = null;
    if (booking.ward_id) {
      const { data: wardData } = await supabase
        .from("wards")
        .select("*")
        .eq("id", booking.ward_id)
        .maybeSingle();
      ward = wardData ?? null;
    }

    const { data: events } = await supabase
      .from("booking_events")
      .select("from_status, to_status, actor_id, note, occurred_at")
      .eq("booking_id", id)
      .order("occurred_at", { ascending: true });

    return NextResponse.json({ booking, ward, events: events ?? [] });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
