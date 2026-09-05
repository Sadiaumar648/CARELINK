import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin's "View Reviews" — the platform's real review data, moderated in
// one place. Today reviews.rating is a parent's rating of a caregiver
// only (migration 20260827200000_messaging_reviews_reports.sql: the
// insert policy is parent-only, on a completed booking; staff_response
// is a text-only reply, not an independent rating). Caregiver→parent
// reviews do not exist in the schema yet — that would need a genuine,
// deliberate change (a nullable rating column reused, or a new
// staff_rating column, plus a widened insert policy), not something to
// improvise here. This route reads exactly what exists and says so via
// `direction`, rather than fabricating a second review row per booking.
const LIMIT = 200;
// "More than 2" poor reviews, per the final product rule — poor is
// defined here as a 1- or 2-star rating (never hidden ones, since a
// hidden review is already out of public/rating-average circulation).
const POOR_RATING_MAX = 2;
const POOR_REVIEW_FLAG_THRESHOLD = 2;

type ReviewRow = {
  id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  staff_response: string | null;
  hidden_by_admin: boolean;
  hidden_reason: string | null;
  created_at: string;
};

type BookingRow = {
  id: string;
  reference: string;
  parent_profile_id: string;
  staff_profile_id: string;
};

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data: reviews, error: reviewsErr } = await supabase
      .from("reviews")
      .select(
        "id, booking_id, rating, comment, staff_response, hidden_by_admin, hidden_reason, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (reviewsErr) return NextResponse.json({ error: reviewsErr.message }, { status: 500 });

    const bookingIds = [...new Set((reviews ?? []).map((r) => r.booking_id))];
    const { data: bookings, error: bookingsErr } =
      bookingIds.length > 0
        ? await supabase
            .from("bookings")
            .select("id, reference, parent_profile_id, staff_profile_id")
            .in("id", bookingIds)
        : { data: [] as BookingRow[], error: null };
    if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 });

    const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));
    const parentProfileIds = [...new Set((bookings ?? []).map((b) => b.parent_profile_id))];
    const staffProfileIds = [...new Set((bookings ?? []).map((b) => b.staff_profile_id))];

    const [parentProfilesRes, staffProfilesRes] = await Promise.all([
      parentProfileIds.length > 0
        ? supabase.from("parent_profiles").select("id, user_id").in("id", parentProfileIds)
        : Promise.resolve({ data: [] as { id: string; user_id: string }[], error: null }),
      staffProfileIds.length > 0
        ? supabase.from("staff_profiles").select("id, user_id").in("id", staffProfileIds)
        : Promise.resolve({ data: [] as { id: string; user_id: string }[], error: null }),
    ]);
    if (parentProfilesRes.error)
      return NextResponse.json({ error: parentProfilesRes.error.message }, { status: 500 });
    if (staffProfilesRes.error)
      return NextResponse.json({ error: staffProfilesRes.error.message }, { status: 500 });

    const parentProfileById = new Map((parentProfilesRes.data ?? []).map((p) => [p.id, p]));
    const staffProfileById = new Map((staffProfilesRes.data ?? []).map((s) => [s.id, s]));

    const userIds = [
      ...new Set([
        ...(parentProfilesRes.data ?? []).map((p) => p.user_id),
        ...(staffProfilesRes.data ?? []).map((s) => s.user_id),
      ]),
    ];
    const { data: users, error: usersErr } =
      userIds.length > 0
        ? await supabase.from("users").select("id, full_name, account_status").in("id", userIds)
        : { data: [] as { id: string; full_name: string; account_status: string }[], error: null };
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

    const userById = new Map((users ?? []).map((u) => [u.id, u]));

    // Poor-review counts, keyed by the reviewed caregiver's staff_profile_id
    // — counted across every fetched review, hidden ones included (a
    // hidden review is still a real poor experience an admin should see a
    // pattern of; hiding it only removes it from the public rating).
    const poorCountByStaffProfileId = new Map<string, number>();
    for (const r of reviews ?? []) {
      if (r.rating > POOR_RATING_MAX) continue;
      const booking = bookingById.get(r.booking_id);
      if (!booking) continue;
      poorCountByStaffProfileId.set(
        booking.staff_profile_id,
        (poorCountByStaffProfileId.get(booking.staff_profile_id) ?? 0) + 1,
      );
    }

    const reviewList = (reviews ?? []).map((r: ReviewRow) => {
      const booking = bookingById.get(r.booking_id);
      const parentProfile = booking ? parentProfileById.get(booking.parent_profile_id) : undefined;
      const staffProfile = booking ? staffProfileById.get(booking.staff_profile_id) : undefined;
      const reviewer = parentProfile ? userById.get(parentProfile.user_id) : undefined;
      const reviewed = staffProfile ? userById.get(staffProfile.user_id) : undefined;
      const poorCount = booking
        ? (poorCountByStaffProfileId.get(booking.staff_profile_id) ?? 0)
        : 0;
      return {
        id: r.id,
        direction: "parent_to_caregiver" as const,
        rating: r.rating,
        comment: r.comment,
        staffResponse: r.staff_response,
        hiddenByAdmin: r.hidden_by_admin,
        hiddenReason: r.hidden_reason,
        createdAt: r.created_at,
        bookingReference: booking?.reference ?? null,
        reviewerName: reviewer?.full_name ?? "Unknown parent",
        reviewedName: reviewed?.full_name ?? "Unknown caregiver",
        reviewedUserId: staffProfile?.user_id ?? null,
        reviewedAccountStatus: reviewed?.account_status ?? null,
        flagged: poorCount > POOR_REVIEW_FLAG_THRESHOLD,
      };
    });

    const flaggedAccounts = [...poorCountByStaffProfileId.entries()]
      .filter(([, count]) => count > POOR_REVIEW_FLAG_THRESHOLD)
      .map(([staffProfileId, poorReviewCount]) => {
        const staffProfile = staffProfileById.get(staffProfileId);
        const user = staffProfile ? userById.get(staffProfile.user_id) : undefined;
        return {
          staffProfileId,
          userId: staffProfile?.user_id ?? null,
          fullName: user?.full_name ?? "Unknown caregiver",
          accountStatus: user?.account_status ?? null,
          poorReviewCount,
        };
      });

    return NextResponse.json({ reviews: reviewList, flaggedAccounts });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
