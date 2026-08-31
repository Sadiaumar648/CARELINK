import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { computeCommissionSplit } from "@/lib/services/commission";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Task 3.8 (closes the session) and 3.9 (credits the commission split
// against the succeeded payment, at the configured rate). staff_profiles.
// bookings_completed increments automatically via a trigger.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/end">) {
  try {
    const { supabase } = await requireRole(request, ["parent", "staff"]);
    const { id } = await ctx.params;

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (booking.status !== "active") {
      return NextResponse.json({ error: "This session isn't active" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from("bookings")
      .update({ status: "completed", session_ended_at: now, completed_at: now })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // SafeTrack (caregiver safety spec): stop location sharing the
    // instant the session ends, regardless of which party ended it — the
    // caregiver-owned delete policy wouldn't cover a parent-initiated
    // end, so this goes through the service role rather than the
    // request-scoped client. Best-effort: a booking that never had
    // sharing enabled has no row to delete, which is not an error.
    await createServiceRoleClient().from("caregiver_locations").delete().eq("booking_id", id);

    const { data: settingRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "commission_rate")
      .single();
    const commissionRate = Number(settingRow?.value ?? 0.15);

    const { data: succeededPayment } = await supabase
      .from("payments")
      .select("id, amount")
      .eq("booking_id", id)
      .eq("status", "succeeded")
      .maybeSingle();

    if (succeededPayment) {
      const { commissionAmount, payoutAmount } = computeCommissionSplit(
        succeededPayment.amount,
        commissionRate,
      );
      await supabase
        .from("payments")
        .update({
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          payout_amount: payoutAmount,
          settled_at: now,
        })
        .eq("id", succeededPayment.id);
    }

    return NextResponse.json({ booking: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
