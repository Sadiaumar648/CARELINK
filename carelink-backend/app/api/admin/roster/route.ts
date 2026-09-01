import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 4.11 (roster table). Verification and profile-completeness state
// at a glance, per doc 3 (App Flow) §5.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, full_name, phone, email, account_status, verification_status, verification_method, agency_reference_id, invited_by, created_at, staff_profiles(id, caregiver_type, hourly_rate, years_experience, rating_avg, rating_count, bookings_completed, accepting_bookings)",
      )
      .eq("role", "staff")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const roster = data.map((row) => {
      const profile = Array.isArray(row.staff_profiles)
        ? row.staff_profiles[0]
        : row.staff_profiles;
      return {
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        accountStatus: row.account_status,
        verificationStatus: row.verification_status,
        verificationMethod: row.verification_method,
        agencyReferenceId: row.agency_reference_id,
        existingAgencyUser: row.invited_by !== null,
        invitationStatus:
          row.invited_by === null ? null : row.account_status === "invited" ? "pending" : "claimed",
        profileComplete: Boolean(profile),
        caregiverType: profile?.caregiver_type ?? null,
        ratingAvg: profile?.rating_avg ?? null,
        bookingsCompleted: profile?.bookings_completed ?? 0,
        acceptingBookings: profile?.accepting_bookings ?? false,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ roster });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
