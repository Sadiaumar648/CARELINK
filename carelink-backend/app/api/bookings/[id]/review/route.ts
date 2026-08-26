import { NextResponse } from "next/server";
import { z } from "zod";
import { createReviewSchema, staffResponseSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 4.8. The unique constraint on reviews.booking_id (migration 0021)
// is the actual "once" guarantee; the RLS insert policy is what limits
// it to the parent on a completed booking.
export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/review">) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;
    const body = createReviewSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("reviews")
      .insert({ booking_id: id, rating: body.rating, comment: body.comment ?? null })
      .select()
      .single();

    if (error) {
      const message = error.message.includes("duplicate key")
        ? "This booking has already been reviewed"
        : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ review: data }, { status: 201 });
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

// A caregiver responds once (checked here, since RLS can only gate the
// row, not "was this column already set").
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/review">) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;
    const body = staffResponseSchema.parse(await request.json());

    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, staff_response")
      .eq("booking_id", id)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.staff_response) {
      return NextResponse.json(
        { error: "You've already responded to this review" },
        { status: 400 },
      );
    }

    const { data: updated, error } = await supabase
      .from("reviews")
      .update({ staff_response: body.staffResponse })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ review: updated });
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
