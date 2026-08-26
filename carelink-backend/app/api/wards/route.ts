import { NextResponse } from "next/server";
import { z } from "zod";
import { wardProfileSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnParentProfileId } from "@/lib/parents";

// Task 2.4. Archived wards are excluded from the list but not deleted —
// completed bookings still reference the version in force at the time.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    if (!parentProfileId) {
      return NextResponse.json({ error: "Complete your household profile first" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("wards")
      .select("*")
      .eq("parent_profile_id", parentProfileId)
      .is("archived_at", null)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ wards: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const parentProfileId = await getOwnParentProfileId(supabase, userId);
    if (!parentProfileId) {
      return NextResponse.json({ error: "Complete your household profile first" }, { status: 400 });
    }

    const body = wardProfileSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("wards")
      .insert({
        parent_profile_id: parentProfileId,
        display_name: body.displayName,
        age_years: body.ageYears,
        allergies: body.allergies ?? null,
        medications: body.medications ?? null,
        meal_notes: body.mealNotes ?? null,
        routine_notes: body.routineNotes ?? null,
        special_needs: body.specialNeeds ?? null,
        house_rules: body.houseRules ?? null,
        general_notes: body.generalNotes ?? null,
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ward: data }, { status: 201 });
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
