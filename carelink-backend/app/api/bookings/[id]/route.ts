import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Task 2.13 (detail), 2.14 (care profile attachment) and 3.8 (symmetric
// emergency-contact reveal). The ward is fetched through the same
// request-scoped client as the booking, so row-level security alone
// decides whether it comes back. The emergency contact is narrower than
// RLS can express in one row-level policy (visible to the counterparty
// only while status is exactly "active", never before or after) — it's
// fetched explicitly here, gated on that one condition, and nowhere else
// in the API surface exposes it.
export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const { supabase, role } = await requireUser(request);
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

    // The counterparty's emergency contact (gated to exactly "active",
    // symmetric — task 3.8) and their user id, which — unlike the
    // emergency contact — is reasonable to know at any point once a
    // booking exists between the two of you: it's what filing a report
    // against them needs (task 4.9), and not a new disclosure beyond what
    // messaging/reviews already imply.
    let emergencyContact: { name: string; phone: string } | null = null;
    let counterpartyUserId: string | null = null;
    if (role === "parent" || role === "staff") {
      const admin = createServiceRoleClient();
      const counterpartyTable = role === "parent" ? "staff_profiles" : "parent_profiles";
      const counterpartyId =
        role === "parent" ? booking.staff_profile_id : booking.parent_profile_id;
      const { data } = await admin
        .from(counterpartyTable)
        .select("user_id, emergency_contact_name, emergency_contact_phone")
        .eq("id", counterpartyId)
        .maybeSingle();
      counterpartyUserId = data?.user_id ?? null;
      if (data && booking.status === "active") {
        emergencyContact = {
          name: data.emergency_contact_name,
          phone: data.emergency_contact_phone,
        };
      }
    }

    return NextResponse.json({
      booking,
      ward,
      events: events ?? [],
      emergencyContact,
      counterpartyUserId,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
