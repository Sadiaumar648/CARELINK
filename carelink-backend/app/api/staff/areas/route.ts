import { NextResponse } from "next/server";
import { z } from "zod";
import { staffAreasSchema, type StaffAreasInput } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Task 2.2. Exactly one area is primary — normalized server-side rather
// than trusted from input, since it drives the area-fit factor in
// matching (task 2.7).
function normalizePrimary(areas: StaffAreasInput["areas"]) {
  const primaryIndex = Math.max(
    0,
    areas.findIndex((a) => a.isPrimary),
  );
  return areas.map((a, i) => ({ ...a, isPrimary: i === primaryIndex }));
}

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("staff_areas")
      .select("area, is_primary")
      .eq("staff_profile_id", staffProfileId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      areas: data.map((row) => ({ area: row.area, isPrimary: row.is_primary })),
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const body = staffAreasSchema.parse(await request.json());
    const areas = normalizePrimary(body.areas);

    const { error: deleteErr } = await supabase
      .from("staff_areas")
      .delete()
      .eq("staff_profile_id", staffProfileId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    const { error: insertErr } = await supabase.from("staff_areas").insert(
      areas.map((a) => ({
        staff_profile_id: staffProfileId,
        area: a.area,
        is_primary: a.isPrimary,
      })),
    );
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    return NextResponse.json({ areas });
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
