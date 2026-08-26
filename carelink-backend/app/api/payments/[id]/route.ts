import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";
import { getPaymentProvider } from "@/lib/services/payment-provider";

// Polls a pending payment on read — the frontend's waiting state calls
// this repeatedly (doc 3, App Flow, §3.4).
export async function GET(request: Request, ctx: RouteContext<"/api/payments/[id]">) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await ctx.params;

    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (payment.status !== "pending" || !payment.provider_reference) {
      return NextResponse.json({ payment });
    }

    const provider = getPaymentProvider();
    const outcome = await provider.pollStatus(payment.provider_reference, payment.payer_phone);
    if (outcome === payment.status) {
      return NextResponse.json({ payment });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("payments")
      .update({
        status: outcome,
        failure_reason: outcome === "failed" ? "Payment declined by network" : null,
      })
      .eq("id", id)
      .select()
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    if (outcome === "succeeded") {
      await supabase.from("bookings").update({ status: "paid" }).eq("id", payment.booking_id);
    }

    return NextResponse.json({ payment: updated });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
