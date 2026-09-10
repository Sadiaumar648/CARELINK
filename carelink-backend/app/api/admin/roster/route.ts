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
        "id, full_name, phone, email, account_status, verification_status, verification_method, agency_reference_id, invited_by, created_at, staff_profiles(id, photo_path, caregiver_type, hourly_rate, years_experience, rating_avg, rating_count, bookings_completed, accepting_bookings, dispatch_available)",
      )
      .eq("role", "staff")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const staffProfileIds = data
      .map((row) => {
        const profile = Array.isArray(row.staff_profiles)
          ? row.staff_profiles[0]
          : row.staff_profiles;
        return profile?.id ?? null;
      })
      .filter((id): id is string => id !== null);

    // Additive: the caregiver's primary named area, reused from the
    // existing staff_areas table (already how a caregiver's public
    // profile shows their area elsewhere in this app) — never a raw
    // GPS coordinate, and not the live dispatch fix.
    const { data: areas } =
      staffProfileIds.length > 0
        ? await supabase
            .from("staff_areas")
            .select("staff_profile_id, area, is_primary")
            .in("staff_profile_id", staffProfileIds)
            .eq("is_primary", true)
        : { data: [] };
    const areaByProfileId = new Map(
      (areas ?? []).map((a) => [a.staff_profile_id, a.area as string]),
    );

    // Real completed-care hours, per the Admin Caregivers roster's
    // requirement to show actual session duration rather than a booking
    // count. bookings.duration_hours is an existing generated column
    // (ends_at - starts_at); nothing here recomputes a booking's price
    // or touches the booking/dispatch pipeline — it's a read-only sum
    // over already-completed bookings.
    const { data: completedBookings } =
      staffProfileIds.length > 0
        ? await supabase
            .from("bookings")
            .select("staff_profile_id, duration_hours, duration_days")
            .eq("status", "completed")
            .in("staff_profile_id", staffProfileIds)
        : {
            data: [] as {
              staff_profile_id: string;
              duration_hours: number;
              duration_days: number | null;
            }[],
          };
    const hoursByProfileId = new Map<string, number>();
    for (const b of completedBookings ?? []) {
      // duration_hours is one day's window; a multi-day engagement's
      // real hours are that × duration_days.
      hoursByProfileId.set(
        b.staff_profile_id,
        (hoursByProfileId.get(b.staff_profile_id) ?? 0) +
          Number(b.duration_hours) * (b.duration_days ?? 1),
      );
    }

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
        staffProfileId: profile?.id ?? null,
        photoPath: profile?.photo_path ?? null,
        caregiverType: profile?.caregiver_type ?? null,
        ratingAvg: profile?.rating_avg ?? null,
        bookingsCompleted: profile?.bookings_completed ?? 0,
        completedCareHours: profile ? Math.round(hoursByProfileId.get(profile.id) ?? 0) : 0,
        acceptingBookings: profile?.accepting_bookings ?? false,
        dispatchAvailable: profile?.dispatch_available ?? false,
        primaryArea: profile ? (areaByProfileId.get(profile.id) ?? null) : null,
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
