import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin dashboard's "Recent Activity" — a real, merged feed from every
// event source that already has a created/occurred timestamp: booking
// status transitions (booking_events, the original source), caregiver
// applications (verification_submissions), reviews submitted (both
// directions), payments received, and care requests created. Every
// source here already exists and is already admin-readable under its
// own RLS; this route only merges and sorts them by time — it never
// invents an event, and a source with nothing recent simply contributes
// nothing to the merge rather than a placeholder row.
const LIMIT = 15;
// Each source is over-fetched a little past LIMIT before the merge, so
// that trimming to LIMIT afterward still reflects genuine recency
// across sources rather than favoring whichever query ran first.
const PER_SOURCE_LIMIT = LIMIT;

const BOOKING_EVENT_LABEL: Record<string, string> = {
  accepted: "Caregiver accepted request",
  paid: "Payment received",
  active: "Care session started",
  completed: "Booking completed",
  declined: "Caregiver declined request",
  cancelled: "Booking cancelled",
  expired: "Offer expired",
};

type ActivityRow = {
  bookingId: string | null;
  reference: string | null;
  label: string;
  occurredAt: string;
};

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const [
      bookingEventsRes,
      paymentsRes,
      applicationsRes,
      reviewsRes,
      caregiverReviewsRes,
      careRequestsRes,
    ] = await Promise.all([
      supabase
        .from("booking_events")
        .select("booking_id, to_status, occurred_at, bookings(reference)")
        .order("occurred_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      supabase
        .from("payments")
        .select("booking_id, settled_at, created_at, bookings(reference)")
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      supabase
        .from("verification_submissions")
        .select("created_at, users!verification_submissions_user_id_fkey(full_name, role)")
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      supabase
        .from("reviews")
        .select("booking_id, created_at, bookings(reference)")
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      supabase
        .from("caregiver_reviews")
        .select("booking_id, created_at, bookings(reference)")
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
      supabase
        .from("care_requests")
        .select("id, created_at")
        .order("created_at", { ascending: false })
        .limit(PER_SOURCE_LIMIT),
    ]);

    if (bookingEventsRes.error)
      return NextResponse.json({ error: bookingEventsRes.error.message }, { status: 500 });

    const activity: ActivityRow[] = [];

    for (const e of bookingEventsRes.data ?? []) {
      const booking = Array.isArray(e.bookings) ? e.bookings[0] : e.bookings;
      activity.push({
        bookingId: e.booking_id,
        reference: (booking as { reference: string } | null)?.reference ?? null,
        label: BOOKING_EVENT_LABEL[e.to_status] ?? `Booking ${e.to_status}`,
        occurredAt: e.occurred_at,
      });
    }

    for (const p of paymentsRes.data ?? []) {
      const booking = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings;
      activity.push({
        bookingId: p.booking_id,
        reference: (booking as { reference: string } | null)?.reference ?? null,
        label: "Payment received",
        occurredAt: p.settled_at ?? p.created_at,
      });
    }

    for (const a of applicationsRes.data ?? []) {
      const applicant = Array.isArray(a.users) ? a.users[0] : a.users;
      const role = (applicant as { role: string } | null)?.role;
      if (role !== "staff") continue; // parent verification submissions aren't "caregiver applications"
      activity.push({
        bookingId: null,
        reference: (applicant as { full_name: string } | null)?.full_name ?? null,
        label: "New caregiver application",
        occurredAt: a.created_at,
      });
    }

    for (const r of reviewsRes.data ?? []) {
      const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
      activity.push({
        bookingId: r.booking_id,
        reference: (booking as { reference: string } | null)?.reference ?? null,
        label: "Parent review submitted",
        occurredAt: r.created_at,
      });
    }

    for (const r of caregiverReviewsRes.data ?? []) {
      const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
      activity.push({
        bookingId: r.booking_id,
        reference: (booking as { reference: string } | null)?.reference ?? null,
        label: "Caregiver review submitted",
        occurredAt: r.created_at,
      });
    }

    for (const cr of careRequestsRes.data ?? []) {
      activity.push({
        bookingId: null,
        reference: null,
        label: "Care request created",
        occurredAt: cr.created_at,
      });
    }

    activity.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    return NextResponse.json({ activity: activity.slice(0, LIMIT) });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
