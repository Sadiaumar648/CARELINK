import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Task 2.12. The pre-check below names the conflicting booking for a
// good error message; the exclusion constraint on bookings (task 2.10)
// is the actual guarantee under concurrent acceptance, since two
// simultaneous accepts can both pass the pre-check before either commits.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/accept">) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (booking.staff_profile_id !== staffProfileId) {
      return NextResponse.json({ error: "This request wasn't sent to you" }, { status: 403 });
    }
    if (booking.status !== "pending") {
      return NextResponse.json({ error: "This request is no longer pending" }, { status: 400 });
    }

    const { data: conflicting } = await supabase
      .from("bookings")
      .select("reference, starts_at, ends_at")
      .eq("staff_profile_id", staffProfileId)
      .in("status", ["accepted", "paid", "active"])
      .neq("id", id)
      .lt("starts_at", booking.ends_at)
      .gt("ends_at", booking.starts_at)
      .maybeSingle();

    if (conflicting) {
      return NextResponse.json(
        {
          error: `This overlaps an already-accepted booking (${conflicting.reference})`,
          conflictingBooking: conflicting,
        },
        { status: 400 },
      );
    }

    const { data: updated, error: updateErr } = await supabase
      .from("bookings")
      .update({ status: "accepted", terms_locked_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      if (updateErr.message.includes("bookings_no_overlap")) {
        return NextResponse.json(
          { error: "This time was just accepted for another booking" },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: updateErr.message }, { status: 400 });
    }

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
