import { NextResponse } from "next/server";
import { z } from "zod";
import { createReportSchema } from "@carelink/shared";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// Task 4.9. Never resolved between the parties — always routed to the
// administrator queue.
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireUser(request);
    const body = createReportSchema.parse(await request.json());

    if (body.subjectUserId === userId) {
      return NextResponse.json({ error: "You can't report yourself" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("reports")
      .insert({
        booking_id: body.bookingId ?? null,
        reporter_id: userId,
        subject_user_id: body.subjectUserId,
        category: body.category,
        description: body.description,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ report: data }, { status: 201 });
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

// A user's own filed reports and their resolution status (doc 3, App
// Flow, §3.5 "Account" screen).
export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reports: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
