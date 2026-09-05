import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin dashboard's "Recent Activity" — real, already-logged booking
// status transitions (booking_events, written by the existing trigger
// on every bookings status change — see 20260827110000_bookings.sql).
// No fabricated activity feed: this is the one reliable event source
// that already exists, admin-readable under booking_events_read_parties'
// own RLS policy. Reports and new care-request creation aren't unioned
// in here — a real, honestly-scoped feed from one authoritative source,
// not synthesized from several loosely-related tables.
const LIMIT = 15;

const LABEL: Record<string, string> = {
  accepted: "Caregiver accepted request",
  paid: "Payment received",
  active: "Care session started",
  completed: "Booking completed",
  declined: "Caregiver declined request",
  cancelled: "Booking cancelled",
  expired: "Offer expired",
};

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data, error } = await supabase
      .from("booking_events")
      .select("booking_id, to_status, occurred_at, bookings(reference)")
      .order("occurred_at", { ascending: false })
      .limit(LIMIT);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const activity = (data ?? []).map((e) => {
      const booking = Array.isArray(e.bookings) ? e.bookings[0] : e.bookings;
      return {
        bookingId: e.booking_id,
        reference: (booking as { reference: string } | null)?.reference ?? null,
        status: e.to_status,
        label: LABEL[e.to_status] ?? `Booking ${e.to_status}`,
        occurredAt: e.occurred_at,
      };
    });

    return NextResponse.json({ activity });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
