import { NextResponse } from "next/server";
import { z } from "zod";
import { declineBookingSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";
import { notifyParentDirectBookingDeclined } from "@/lib/services/notify";

export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/decline">) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const body = declineBookingSchema.parse(await request.json().catch(() => ({})));

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("staff_profile_id, status")
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

    const { data: updated, error: updateErr } = await supabase
      .from("bookings")
      .update({ status: "declined", decline_reason: body.reason ?? null })
      .eq("id", id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    // CareLink's real email notification system: only for a direct
    // (non-dispatch) booking. A decline during sequential dispatch is
    // silently absorbed by the next dispatch round — the parent is
    // already watching a live, polled search screen for that — so
    // texting on every decline in that sequence would be exactly the
    // "a notification for every minor UI event" this feature is meant to avoid. A
    // direct booking has no automatic next step, so the parent
    // genuinely needs to know here.
    if (!updated.care_request_id) {
      await notifyParentDirectBookingDeclined({
        id: updated.id,
        parent_profile_id: updated.parent_profile_id,
      }).catch(() => {});
    }

    return NextResponse.json({ booking: updated });
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
