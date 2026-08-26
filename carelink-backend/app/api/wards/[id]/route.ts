import { NextResponse } from "next/server";
import { z } from "zod";
import { wardProfileSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

const wardUpdateSchema = wardProfileSchema.partial();

export async function GET(request: Request, ctx: RouteContext<"/api/wards/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;

    const { data, error } = await supabase.from("wards").select("*").eq("id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ward: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/wards/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;
    const body = wardUpdateSchema.parse(await request.json());

    const updates: Record<string, unknown> = {};
    if (body.displayName !== undefined) updates.display_name = body.displayName;
    if (body.ageYears !== undefined) updates.age_years = body.ageYears;
    if (body.allergies !== undefined) updates.allergies = body.allergies;
    if (body.medications !== undefined) updates.medications = body.medications;
    if (body.mealNotes !== undefined) updates.meal_notes = body.mealNotes;
    if (body.routineNotes !== undefined) updates.routine_notes = body.routineNotes;
    if (body.specialNeeds !== undefined) updates.special_needs = body.specialNeeds;
    if (body.houseRules !== undefined) updates.house_rules = body.houseRules;
    if (body.generalNotes !== undefined) updates.general_notes = body.generalNotes;

    const { data, error } = await supabase
      .from("wards")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ward: data });
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

// Archives rather than deletes — a completed booking retains the version
// of the ward's profile in force when it was made (doc 1, PRD, F7).
export async function DELETE(request: Request, ctx: RouteContext<"/api/wards/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("wards")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ward: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
