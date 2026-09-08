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
    // No household step required to have wards — a parent with no
    // profile row yet simply has no wards yet, not an error.
    if (!parentProfileId) {
      return NextResponse.json({ wards: [] });
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
    let parentProfileId = await getOwnParentProfileId(supabase, userId);
    if (!parentProfileId) {
      // A parent no longer sets up a household (area, emergency contact)
      // before adding their first child — each care request already
      // carries its own real, resolved location independently. A bare
      // profile row is created here, on first use; area/emergency
      // contact are still real fields a parent can fill in later from
      // Settings whenever they choose (migration
      // 20260916000000_parent_profiles_household_optional.sql is what
      // made them nullable so this insert can succeed with neither).
      const { data: created, error: createErr } = await supabase
        .from("parent_profiles")
        .insert({ user_id: userId })
        .select("id")
        .single();
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });
      parentProfileId = created.id;
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
