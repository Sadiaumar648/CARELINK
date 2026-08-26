import { NextResponse } from "next/server";
import { z } from "zod";
import { initiatePaymentSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";
import { getPaymentProvider } from "@/lib/services/payment-provider";

// Task 3.7. The amount comes from the booking's locked total, never the
// request body (doc 5 §4.10) — a mismatch is structurally impossible
// here since the amount is never read from the client at all.
export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/payments">) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;
    const body = initiatePaymentSchema.parse(await request.json());

    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking || booking.parent_profile_id !== parentProfileId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
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
      await supabase.from("bookings").update({ status: "paid" }).eq("id", id);
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
