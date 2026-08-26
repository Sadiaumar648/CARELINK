import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 4.10/4.11. Figures computed directly from the base tables for a
// selected period rather than through a fixed set of named SQL views —
// functionally equivalent to doc 5 §6's view list, and easier to keep
// correct under a date-range filter that changes per request.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const url = new URL(request.url);
    const from =
      url.searchParams.get("from") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const to = url.searchParams.get("to") ?? new Date().toISOString();

    const [bookingsRes, paymentsRes, staffRes, verificationsRes, reportsRes] = await Promise.all([
      supabase.from("bookings").select("status").gte("created_at", from).lte("created_at", to),
      supabase
        .from("payments")
        .select("amount")
        .eq("status", "succeeded")
        .gte("settled_at", from)
        .lte("settled_at", to),
      supabase.from("staff_profiles").select("id, accepting_bookings, users!inner(account_status)"),
      supabase
        .from("verification_submissions")
        .select("created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1),
      supabase.from("reports").select("id").in("status", ["open", "investigating"]),
    ]);

    if (bookingsRes.error)
      return NextResponse.json({ error: bookingsRes.error.message }, { status: 500 });
    if (paymentsRes.error)
      return NextResponse.json({ error: paymentsRes.error.message }, { status: 500 });
    if (staffRes.error)
      return NextResponse.json({ error: staffRes.error.message }, { status: 500 });

    const bookingsByStatus: Record<string, number> = {};
    for (const b of bookingsRes.data ?? []) {
      bookingsByStatus[b.status] = (bookingsByStatus[b.status] ?? 0) + 1;
    }
    const totalBookings = bookingsRes.data?.length ?? 0;
    const completed = bookingsByStatus.completed ?? 0;
    const declined = bookingsByStatus.declined ?? 0;

    const revenue = (paymentsRes.data ?? []).reduce((sum, p) => sum + p.amount, 0);
    const averageBookingValue =
      (paymentsRes.data?.length ?? 0) > 0 ? Math.round(revenue / paymentsRes.data!.length) : 0;

    const activeStaffCount = (staffRes.data ?? []).filter(
      (s) =>
        s.accepting_bookings &&
        (s.users as unknown as { account_status: string })?.account_status === "active",
    ).length;

    const oldestPending = verificationsRes.data?.[0]?.created_at ?? null;

    return NextResponse.json({
      period: { from, to },
      bookings: {
        total: totalBookings,
        byStatus: bookingsByStatus,
        completionRate: totalBookings > 0 ? completed / totalBookings : 0,
        declineRate: totalBookings > 0 ? declined / totalBookings : 0,
      },
      revenue: { total: revenue, averageBookingValue },
      activeStaffCount,
      verificationQueue: { oldestPendingSince: oldestPending },
      openReports: reportsRes.data?.length ?? 0,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
