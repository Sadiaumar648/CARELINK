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

    let emergencyContact: { name: string; phone: string } | null = null;
    if (booking.status === "active") {
      const admin = createServiceRoleClient();
      if (role === "parent") {
        const { data } = await admin
          .from("staff_profiles")
          .select("emergency_contact_name, emergency_contact_phone")
          .eq("id", booking.staff_profile_id)
          .maybeSingle();
        if (data)
          emergencyContact = {
            name: data.emergency_contact_name,
            phone: data.emergency_contact_phone,
          };
      } else if (role === "staff") {
        const { data } = await admin
          .from("parent_profiles")
          .select("emergency_contact_name, emergency_contact_phone")
          .eq("id", booking.parent_profile_id)
          .maybeSingle();
        if (data)
          emergencyContact = {
            name: data.emergency_contact_name,
            phone: data.emergency_contact_phone,
          };
      }
    }

    return NextResponse.json({ booking, ward, events: events ?? [], emergencyContact });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
