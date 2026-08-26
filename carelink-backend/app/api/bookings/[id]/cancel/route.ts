import { NextResponse } from "next/server";
import { z } from "zod";
import { cancelBookingSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 3.10. A paid cancellation flags the payment for administrator
// action rather than auto-refunding — the refund itself is a step an
// administrator takes (doc 1, PRD, F8), not something this route does.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent", "staff"]);
    const { id } = await ctx.params;
    const body = cancelBookingSchema.parse(await request.json());

    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["pending", "accepted", "paid"].includes(booking.status)) {
      return NextResponse.json(
        { error: "This booking can no longer be cancelled" },
        { status: 400 },
      );
    }

    const wasPaid = booking.status === "paid";

    const { data: updated, error } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_by: userId, cancel_reason: body.reason })
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    if (wasPaid) {
      const { data: succeededPayment } = await supabase
        .from("payments")
        .select("id, amount")
        .eq("booking_id", id)
        .eq("status", "succeeded")
        .maybeSingle();
      if (succeededPayment) {
        await supabase
          .from("payments")
          .update({ refunded_amount: succeededPayment.amount })
          .eq("id", succeededPayment.id);
      }
    }

    return NextResponse.json({ booking: updated });
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
