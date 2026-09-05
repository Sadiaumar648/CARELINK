import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin's "View Reviews" — merges both real review directions:
// public.reviews (parent -> caregiver, unchanged) and
// public.caregiver_reviews (caregiver -> parent, additive, migration
// 20260913000000_caregiver_reviews.sql). Each row keeps its own table's
// real shape; nothing here fabricates a review that doesn't exist in
// either table.
const LIMIT = 200;
// "More than 2" poor reviews, per the final product rule — poor is
// defined here as a 1- or 2-star rating (never hidden ones, since a
// hidden review is already out of public/rating-average circulation).
const POOR_RATING_MAX = 2;
const POOR_REVIEW_FLAG_THRESHOLD = 2;

type ParentReviewRow = {
  id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  staff_response: string | null;
  hidden_by_admin: boolean;
  hidden_reason: string | null;
  created_at: string;
};

type CaregiverReviewRow = {
  id: string;
  booking_id: string;
  staff_profile_id: string;
  parent_profile_id: string;
  rating: number;
  comment: string | null;
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

type UserRow = { id: string; full_name: string; account_status: string };

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const [reviewsRes, caregiverReviewsRes] = await Promise.all([
      supabase
        .from("reviews")
        .select(
          "id, booking_id, rating, comment, staff_response, hidden_by_admin, hidden_reason, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      supabase
        .from("caregiver_reviews")
        .select(
          "id, booking_id, staff_profile_id, parent_profile_id, rating, comment, hidden_by_admin, hidden_reason, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(LIMIT),
    ]);
    if (reviewsRes.error)
      return NextResponse.json({ error: reviewsRes.error.message }, { status: 500 });
    if (caregiverReviewsRes.error)
      return NextResponse.json({ error: caregiverReviewsRes.error.message }, { status: 500 });

    const parentReviews = (reviewsRes.data ?? []) as ParentReviewRow[];
    const caregiverReviews = (caregiverReviewsRes.data ?? []) as CaregiverReviewRow[];

    // reviews (parent->caregiver) only stores booking_id — its
    // parent/staff profile ids are resolved via bookings, same as
    // before. caregiver_reviews (caregiver->parent) stores
    // staff_profile_id/parent_profile_id directly, so those don't need
    // a bookings join for that part — only for the booking reference.
    const bookingIds = [
      ...new Set([
        ...parentReviews.map((r) => r.booking_id),
        ...caregiverReviews.map((r) => r.booking_id),
      ]),
    ];
    const { data: bookingsData, error: bookingsErr } =
      bookingIds.length > 0
        ? await supabase
            .from("bookings")
            .select("id, reference, parent_profile_id, staff_profile_id")
            .in("id", bookingIds)
        : { data: [] as BookingRow[], error: null };
    if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 });
    const bookingById = new Map((bookingsData ?? []).map((b) => [b.id, b]));

    const parentProfileIds = [
      ...new Set([
        ...(bookingsData ?? []).map((b) => b.parent_profile_id),
        ...caregiverReviews.map((r) => r.parent_profile_id),
      ]),
    ];
    const staffProfileIds = [
      ...new Set([
        ...(bookingsData ?? []).map((b) => b.staff_profile_id),
        ...caregiverReviews.map((r) => r.staff_profile_id),
      ]),
    ];

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
    const { data: usersData, error: usersErr } =
      userIds.length > 0
        ? await supabase.from("users").select("id, full_name, account_status").in("id", userIds)
        : { data: [] as UserRow[], error: null };
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });
    const userById = new Map((usersData ?? []).map((u) => [u.id, u]));

    // Poor-review counts, kept in two separate maps so the two
    // directions' ratings can never mix — a caregiver's poor-review
    // count only ever comes from `reviews` (parents rating them); a
    // parent's only ever comes from `caregiver_reviews` (caregivers
    // rating them).
    const poorCountByStaffProfileId = new Map<string, number>();
    for (const r of parentReviews) {
      if (r.rating > POOR_RATING_MAX) continue;
      const booking = bookingById.get(r.booking_id);
      if (!booking) continue;
      poorCountByStaffProfileId.set(
        booking.staff_profile_id,
        (poorCountByStaffProfileId.get(booking.staff_profile_id) ?? 0) + 1,
      );
    }
    const poorCountByParentProfileId = new Map<string, number>();
    for (const r of caregiverReviews) {
      if (r.rating > POOR_RATING_MAX) continue;
      poorCountByParentProfileId.set(
        r.parent_profile_id,
        (poorCountByParentProfileId.get(r.parent_profile_id) ?? 0) + 1,
      );
    }

    const parentToCaregiverList = parentReviews.map((r) => {
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
        responseText: r.staff_response,
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

    const caregiverToParentList = caregiverReviews.map((r) => {
      const booking = bookingById.get(r.booking_id);
      const parentProfile = parentProfileById.get(r.parent_profile_id);
      const staffProfile = staffProfileById.get(r.staff_profile_id);
      const reviewer = staffProfile ? userById.get(staffProfile.user_id) : undefined;
      const reviewed = parentProfile ? userById.get(parentProfile.user_id) : undefined;
      const poorCount = poorCountByParentProfileId.get(r.parent_profile_id) ?? 0;
      return {
        id: r.id,
        direction: "caregiver_to_parent" as const,
        rating: r.rating,
        comment: r.comment,
        responseText: null,
        hiddenByAdmin: r.hidden_by_admin,
        hiddenReason: r.hidden_reason,
        createdAt: r.created_at,
        bookingReference: booking?.reference ?? null,
        reviewerName: reviewer?.full_name ?? "Unknown caregiver",
        reviewedName: reviewed?.full_name ?? "Unknown parent",
        reviewedUserId: parentProfile?.user_id ?? null,
        reviewedAccountStatus: reviewed?.account_status ?? null,
        flagged: poorCount > POOR_REVIEW_FLAG_THRESHOLD,
      };
    });

    const reviewList = [...parentToCaregiverList, ...caregiverToParentList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const flaggedCaregivers = [...poorCountByStaffProfileId.entries()]
      .filter(([, count]) => count > POOR_REVIEW_FLAG_THRESHOLD)
      .map(([staffProfileId, poorReviewCount]) => {
        const staffProfile = staffProfileById.get(staffProfileId);
        const user = staffProfile ? userById.get(staffProfile.user_id) : undefined;
        return {
          role: "caregiver" as const,
          profileId: staffProfileId,
          userId: staffProfile?.user_id ?? null,
          fullName: user?.full_name ?? "Unknown caregiver",
          accountStatus: user?.account_status ?? null,
          poorReviewCount,
        };
      });

    const flaggedParents = [...poorCountByParentProfileId.entries()]
      .filter(([, count]) => count > POOR_REVIEW_FLAG_THRESHOLD)
      .map(([parentProfileId, poorReviewCount]) => {
        const parentProfile = parentProfileById.get(parentProfileId);
        const user = parentProfile ? userById.get(parentProfile.user_id) : undefined;
        return {
          role: "parent" as const,
          profileId: parentProfileId,
          userId: parentProfile?.user_id ?? null,
          fullName: user?.full_name ?? "Unknown parent",
          accountStatus: user?.account_status ?? null,
          poorReviewCount,
        };
      });

    return NextResponse.json({
      reviews: reviewList,
      flaggedAccounts: [...flaggedCaregivers, ...flaggedParents],
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
