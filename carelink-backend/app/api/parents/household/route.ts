import { NextResponse } from "next/server";
import { z } from "zod";
import { parentHouseholdSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 1.7, household step. parent_profiles doesn't exist until this
// first save, so PATCH upserts on user_id rather than requiring a prior
// row — the same pattern as task 2.1's staff profile.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const { data, error } = await supabase
      .from("parent_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ household: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const body = parentHouseholdSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("parent_profiles")
      .upsert(
        {
          user_id: userId,
          area: body.area,
          address: body.address ?? null,
          household_notes: body.householdNotes ?? null,
          emergency_contact_name: body.emergencyContactName,
          emergency_contact_phone: body.emergencyContactPhone,
          emergency_contact_relation: body.emergencyContactRelation ?? null,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ household: data });
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
