import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Task 3.11 — the caregiver's own record, reconciled to the payment
// rows to the pesewa.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ earnings: [], totals: { week: 0, month: 0 } });
    }

    const { data: bookings, error: bookingsErr } = await supabase
      .from("bookings")
      .select(
        "id, reference, starts_at, ends_at, duration_hours, duration_days, hourly_rate, total_amount",
      )
      .eq("staff_profile_id", staffProfileId)
      .eq("status", "completed")
      .order("starts_at", { ascending: false });
    if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 });

    const bookingIds = (bookings ?? []).map((b) => b.id);
    const { data: payments, error: paymentsErr } =
      bookingIds.length > 0
        ? await supabase
            .from("payments")
            .select("booking_id, payout_amount, settled_at")
            .in("booking_id", bookingIds)
            .eq("status", "succeeded")
        : { data: [], error: null };
    if (paymentsErr) return NextResponse.json({ error: paymentsErr.message }, { status: 500 });

    const earnings = (bookings ?? []).map((b) => {
      const payment = payments!.find((p) => p.booking_id === b.id);
      return {
        bookingId: b.id,
        reference: b.reference,
        date: b.starts_at,
        // Additive: already-existing columns, not previously selected by
        // this route — needed so the Earnings page can show care type
        // and duration without a second per-booking fetch. durationHours
        // is the total across all days of the engagement (per-day window
        // × duration_days).
        durationHours: Number(b.duration_hours) * (b.duration_days ?? 1),
        durationDays: b.duration_days ?? 1,
        hourlyRate: b.hourly_rate,
        totalAmount: b.total_amount,
        payoutAmount: payment?.payout_amount ?? null,
        settledAt: payment?.settled_at ?? null,
      };
    });

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const sum = (from: Date) =>
      earnings
        .filter((e) => e.settledAt && new Date(e.settledAt) >= from)
        .reduce((total, e) => total + (e.payoutAmount ?? 0), 0);

    return NextResponse.json({
      earnings,
      totals: { week: sum(weekAgo), month: sum(monthStart) },
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
