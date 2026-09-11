import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 3.8, superseded: starting a session is the caregiver's action
// alone now, not either party — the parent only ever watches a session
// happen (the active-session card on their own home page), never
// starts or ends one themselves. Still only on the booking date.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/start">) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (booking.status !== "paid") {
      return NextResponse.json(
        { error: "This booking must be paid before starting" },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const bookingDate = String(booking.starts_at).slice(0, 10);
    if (today !== bookingDate) {
      return NextResponse.json(
        { error: "A session can only start on the booking date" },
        { status: 400 },
      );
    }

    const { data: updated, error } = await supabase
      .from("bookings")
      .update({ status: "active", session_started_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
