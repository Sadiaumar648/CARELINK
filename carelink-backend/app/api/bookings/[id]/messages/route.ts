import { NextResponse } from "next/server";
import { z } from "zod";
import { sendMessageSchema } from "@carelink/shared";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// Task 4.7. RLS is the real boundary — "you must be a party to this
// booking" (read) and "the booking must be paid or active" (insert,
// migration 20260921000000). The insert route also re-checks the
// paid/active status in app code below so the friendly "opens once
// payment is complete" message is shown immediately, without waiting
// for a database that hasn't had the newer migration applied yet.
const MESSAGEABLE_STATUSES = ["paid", "active"];
export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[id]/messages">) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("booking_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ messages: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/bookings/[id]/messages">) {
  try {
    const { supabase, userId } = await requireUser(request);
    const { id } = await ctx.params;
    const body = sendMessageSchema.parse(await request.json());

    // The booking must be paid (or already active) before either party
    // can message. RLS enforces the same rule, but checking here first
    // lets us return the specific "opens once payment is complete"
    // message rather than a generic RLS rejection.
    const { data: booking } = await supabase
      .from("bookings")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (booking && !MESSAGEABLE_STATUSES.includes(booking.status)) {
      return NextResponse.json(
        {
          error:
            booking.status === "accepted"
              ? "Messaging opens once the booking is paid for."
              : "Messaging isn't open for this booking.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("messages")
      .insert({ booking_id: id, sender_id: userId, body: body.body })
      .select()
      .single();

    if (error) {
      const message = error.message.includes("row-level security")
        ? "Messaging isn't open for this booking yet"
        : error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ message: data }, { status: 201 });
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

// Marks every message not sent by the caller as read.
export async function PATCH(request: Request, ctx: RouteContext<"/api/bookings/[id]/messages">) {
  try {
    const { supabase, userId } = await requireUser(request);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("booking_id", id)
      .neq("sender_id", userId)
      .is("read_at", null)
      .select();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: data.length });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
