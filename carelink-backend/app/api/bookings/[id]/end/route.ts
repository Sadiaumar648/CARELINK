import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { completeSession } from "@/lib/services/session-lifecycle";

// Task 3.8 (closes the session) and 3.9 (credits the commission split
// against the succeeded payment, at the configured rate) — the actual
// work is shared with the automatic end-of-session advance
// (lib/services/session-lifecycle.ts's completeSession) that fires on
// its own once a session's scheduled ends_at arrives, so this route is
// now only for ending a session early. staff_profiles.bookings_completed
// increments automatically via a trigger.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/end">) {
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
    if (booking.status !== "active") {
      return NextResponse.json({ error: "This session isn't active" }, { status: 400 });
    }

    const ok = await completeSession(supabase, id, new Date().toISOString());
    if (!ok) return NextResponse.json({ error: "This session isn't active" }, { status: 400 });

    const { data: updated, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
