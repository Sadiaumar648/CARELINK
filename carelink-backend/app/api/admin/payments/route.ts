import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin "Payments" — real payment records, existing table, existing RLS
// (payments_read_parties already includes current_user_role() = 'admin').
// This is the first admin-facing surface over public.payments; no schema
// change, no new payment logic, no Paystack/provider changes — a
// read-only list, mirroring GET /api/admin/bookings's exact shape and
// pattern.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    let query = supabase
      .from("payments")
      .select(
        "id, booking_id, network, amount, status, failure_reason, settled_at, created_at, bookings(reference)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const payments = (data ?? []).map((p) => {
      const booking = Array.isArray(p.bookings) ? p.bookings[0] : p.bookings;
      return {
        id: p.id,
        bookingId: p.booking_id,
        bookingReference: (booking as { reference: string } | null)?.reference ?? null,
        network: p.network,
        amount: p.amount,
        status: p.status,
        failureReason: p.failure_reason,
        settledAt: p.settled_at,
        createdAt: p.created_at,
      };
    });

    return NextResponse.json({ payments });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
