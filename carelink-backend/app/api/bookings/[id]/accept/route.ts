import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { notifyParentCaregiverAccepted } from "@/lib/services/notify";

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

    // CareLink's real email notification system: the parent finds
    // out their caregiver accepted and is directed back to CareLink to
    // pay — this never claims the booking is confirmed/paid, since
    // payment hasn't happened yet.
    await notifyParentCaregiverAccepted({
      id: updated.id,
      parent_profile_id: updated.parent_profile_id,
    }).catch(() => {});

    // Dispatch-only, additive: if this booking was one caregiver's offer
    // in a sequential dispatch (care_request_id is null for every
    // direct/non-dispatch booking, so this simply never runs for them),
    // close the loop — mark the search accepted and expire any sibling
    // pending offer, defensively (sequential dispatch means there
    // should never be more than one). This needs elevated privilege:
    // the accepting caregiver's own RLS-scoped client isn't a party to
    // the parent's care_requests row or to a sibling offer addressed to
    // a different caregiver, so a narrow, already-authorized service-
    // role step runs only after the real accept above has already
    // succeeded under normal RLS.
    if (updated.care_request_id) {
      const admin = createServiceRoleClient();
      await admin
        .from("care_requests")
        .update({ dispatch_status: "accepted" })
        .eq("id", updated.care_request_id);
      await admin
        .from("bookings")
        .update({ status: "expired" })
        .eq("care_request_id", updated.care_request_id)
        .eq("status", "pending")
        .neq("id", updated.id);
    }

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
