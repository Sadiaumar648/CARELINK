import { NextResponse } from "next/server";
import { z } from "zod";
import { createCaregiverReviewSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// The caregiver -> parent direction, mirroring
// app/api/bookings/[id]/review/route.ts's architecture exactly (that
// route, and public.reviews, are untouched by this file). Separate
// route rather than overloading the existing one with a direction
// param, so the parent flow's behavior can't regress from this change.

// GET exists because, unlike the parent ReviewForm (which just shows
// the form unconditionally and relies on the duplicate-key error if
// resubmitted), the caregiver form must not reappear once a review
// already exists — the frontend needs to know that on load.
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/bookings/[id]/caregiver-review">,
) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("caregiver_reviews")
      .select("id, rating, comment, created_at")
      .eq("booking_id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ review: data ?? null });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/bookings/[id]/caregiver-review">,
) {
  try {
    const { supabase } = await requireRole(request, ["staff"]);
    const { id } = await ctx.params;
    const body = createCaregiverReviewSchema.parse(await request.json());

    // Fetched through the caller's own RLS-scoped client: bookings'
    // read policy already only lets a party to the booking read this
    // row, so a successful fetch here already proves the caller is the
    // caregiver on this exact booking — the same trust the parent
    // review route places in the equivalent read. staff_profile_id and
    // parent_profile_id below always come from this row, never from
    // the request body.
    const { data: booking, error: bookingErr } = await supabase
      .from("bookings")
      .select("id, status, staff_profile_id, parent_profile_id")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (booking.status !== "completed") {
      return NextResponse.json(
        { error: "This booking hasn't been completed yet" },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("caregiver_reviews")
      .insert({
        booking_id: id,
        staff_profile_id: booking.staff_profile_id,
        parent_profile_id: booking.parent_profile_id,
        rating: body.rating,
        comment: body.comment ?? null,
      })
      .select()
      .single();

    if (error) {
      const message = error.message.includes("duplicate key")
        ? "You've already reviewed this booking"
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
