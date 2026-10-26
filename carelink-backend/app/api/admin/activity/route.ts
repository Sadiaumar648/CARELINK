import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin dashboard's "Recent Activity" — a real, merged feed from every
// event source that already has a created/occurred timestamp: booking
// status transitions (booking_events, the original source), reviews
// submitted (both directions, with real reviewer/reviewed names),
// payments received, and care requests created. Every source here
// already exists and is
// already admin-readable under its own RLS; this route only merges and
// sorts them by time — it never invents an event, and a source with
// nothing recent simply contributes nothing to the merge rather than a
// placeholder row.
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

type BookingLookup = {
  id: string;
  reference: string | null;
  parent_profile_id: string | null;
  staff_profile_id: string | null;
};

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const [bookingEventsRes, paymentsRes, reviewsRes, caregiverReviewsRes, careRequestsRes] =
      await Promise.all([
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
          .from("reviews")
          .select(
            "booking_id, created_at, bookings(id, reference, parent_profile_id, staff_profile_id)",
          )
          .order("created_at", { ascending: false })
          .limit(PER_SOURCE_LIMIT),
        supabase
          .from("caregiver_reviews")
          .select(
            "booking_id, parent_profile_id, staff_profile_id, created_at, bookings(reference)",
          )
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
    if (reviewsRes.error)
      return NextResponse.json({ error: reviewsRes.error.message }, { status: 500 });
    if (caregiverReviewsRes.error)
      return NextResponse.json({ error: caregiverReviewsRes.error.message }, { status: 500 });

    // Reviewer/reviewed names for the two review sources — a small,
    // separate lookup from GET /api/admin/reviews's own (bigger) one,
    // scoped to just the parent/staff profile ids these recent reviews
    // actually reference.
    const parentProfileIds = new Set<string>();
    const staffProfileIds = new Set<string>();
    for (const r of reviewsRes.data ?? []) {
      const booking = (
        Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
      ) as BookingLookup | null;
      if (booking?.parent_profile_id) parentProfileIds.add(booking.parent_profile_id);
      if (booking?.staff_profile_id) staffProfileIds.add(booking.staff_profile_id);
    }
    for (const r of caregiverReviewsRes.data ?? []) {
      if (r.parent_profile_id) parentProfileIds.add(r.parent_profile_id);
      if (r.staff_profile_id) staffProfileIds.add(r.staff_profile_id);
    }

    const [parentProfilesRes, staffProfilesRes] = await Promise.all([
      parentProfileIds.size > 0
        ? supabase
            .from("parent_profiles")
            .select("id, user_id")
            .in("id", [...parentProfileIds])
        : Promise.resolve({ data: [] as { id: string; user_id: string }[], error: null }),
      staffProfileIds.size > 0
        ? supabase
            .from("staff_profiles")
            .select("id, user_id")
            .in("id", [...staffProfileIds])
        : Promise.resolve({ data: [] as { id: string; user_id: string }[], error: null }),
    ]);
    const parentProfileById = new Map((parentProfilesRes.data ?? []).map((p) => [p.id, p]));
    const staffProfileById = new Map((staffProfilesRes.data ?? []).map((s) => [s.id, s]));

    const userIds = [
      ...new Set([
        ...(parentProfilesRes.data ?? []).map((p) => p.user_id),
        ...(staffProfilesRes.data ?? []).map((s) => s.user_id),
      ]),
    ];
    const { data: usersData } =
      userIds.length > 0
        ? await supabase.from("users").select("id, full_name").in("id", userIds)
        : { data: [] as { id: string; full_name: string }[] };
    const nameByUserId = new Map((usersData ?? []).map((u) => [u.id, u.full_name]));

    function reviewerReviewedLabel(parentProfileId: string | null, staffProfileId: string | null) {
      const parentName = parentProfileId
        ? (nameByUserId.get(parentProfileById.get(parentProfileId)?.user_id ?? "") ?? null)
        : null;
      const staffName = staffProfileId
        ? (nameByUserId.get(staffProfileById.get(staffProfileId)?.user_id ?? "") ?? null)
        : null;
      return { parentName, staffName };
    }

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

    for (const r of reviewsRes.data ?? []) {
      const booking = (
        Array.isArray(r.bookings) ? r.bookings[0] : r.bookings
      ) as BookingLookup | null;
      const { parentName, staffName } = reviewerReviewedLabel(
        booking?.parent_profile_id ?? null,
        booking?.staff_profile_id ?? null,
      );
      activity.push({
        bookingId: r.booking_id,
        reference:
          parentName && staffName ? `${parentName} → ${staffName}` : (booking?.reference ?? null),
        label: "Parent review submitted",
        occurredAt: r.created_at,
      });
    }

    for (const r of caregiverReviewsRes.data ?? []) {
      const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
      const { parentName, staffName } = reviewerReviewedLabel(
        r.parent_profile_id,
        r.staff_profile_id,
      );
      activity.push({
        bookingId: r.booking_id,
        reference:
          parentName && staffName
            ? `${staffName} → ${parentName}`
            : ((booking as { reference: string } | null)?.reference ?? null),
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
