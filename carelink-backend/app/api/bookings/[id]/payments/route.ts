import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePaymentSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";
import { getPaymentProvider } from "@/lib/services/payment-provider";
import { notifyCaregiverBookingConfirmed, notifyParentBookingPaid } from "@/lib/services/notify";

// Task 3.7. The amount comes from the booking's locked total, never the
// request body (doc 5 §4.10) — a mismatch is structurally impossible
// here since the amount is never read from the client at all.
export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/payments">) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;
    const body = initiatePaymentSchema.parse(await request.json());

    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    const { data: bookingRow, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!bookingRow || bookingRow.parent_profile_id !== parentProfileId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const booking = bookingRow;
    if (booking.status !== "accepted") {
      return NextResponse.json({ error: "This booking isn't ready for payment" }, { status: 400 });
    }

    const { data: existingSucceeded } = await supabase
      .from("payments")
      .select("id")
      .eq("booking_id", id)
      .eq("status", "succeeded")
      .maybeSingle();
    if (existingSucceeded) {
      return NextResponse.json({ error: "This booking has already been paid" }, { status: 400 });
    }

    const { data: paymentRow, error: insertErr } = await supabase
      .from("payments")
      .insert({
        booking_id: id,
        network: body.network,
        payer_phone: body.payerPhone,
        amount: booking.total_amount,
      })
      .select()
      .single();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    const provider = getPaymentProvider();
    const result = await provider.initiate({
      amount: booking.total_amount,
      network: body.network,
      payerPhone: body.payerPhone,
      reference: booking.reference,
    });

    const { data: updated, error: updateErr } = await supabase
      .from("payments")
      .update({
        status: result.status,
        provider_reference: result.providerReference,
        failure_reason: result.status === "failed" ? "Payment declined by network" : null,
      })
      .eq("id", paymentRow.id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    if (result.status === "succeeded") {
      // Race-safe against a concurrent reassignCaregiver swap: only
      // moves the booking to 'paid' if it's still genuinely 'accepted'
      // right now. If the parent swapped to a different caregiver (which
      // cancels this booking) in the moment between the check above and
      // this update, this simply matches zero rows rather than
      // resurrecting a released booking as paid.
      const { data: paidRow } = await supabase
        .from("bookings")
        .update({ status: "paid" })
        .eq("id", id)
        .eq("status", "accepted")
        .select("id, parent_profile_id, staff_profile_id")
        .maybeSingle();

      // Only fires when this call is genuinely what flipped the row —
      // the race-safe .eq("status", "accepted") above matches zero rows
      // (paidRow is null) if a concurrent swap already released it
      // first, and this never double-fires on a retry either way
      // (sendEmail's own idempotency guard on booking_id+event_type).
      if (paidRow) {
        await notifyParentBookingPaid({
          id: paidRow.id,
          parent_profile_id: paidRow.parent_profile_id,
        }).catch(() => {});
        await notifyCaregiverBookingConfirmed({
          id: paidRow.id,
          staff_profile_id: paidRow.staff_profile_id,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ payment: updated }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
