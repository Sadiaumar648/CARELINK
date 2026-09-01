import { NextResponse } from "next/server";
import { z } from "zod";
import { staffQualificationsSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Mirrors GET/PUT /api/staff/areas exactly: the caregiver's own PUT
// replaces the whole set (delete, then insert), same shape this project
// already uses for staff_areas and staff_skills. verification_status is
// never accepted from the caregiver here — every inserted row is always
// "unverified" by the table's own default; only an administrator can
// change that (not built in this pass — see the qualifications table's
// admin RLS policy, which already allows it at the data layer).
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("caregiver_qualifications")
      .select("id, name, institution, year, verification_status")
      .eq("staff_profile_id", staffProfileId)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      qualifications: data.map((row) => ({
        id: row.id,
        name: row.name,
        institution: row.institution,
        year: row.year,
        verificationStatus: row.verification_status,
      })),
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

    const body = staffQualificationsSchema.parse(await request.json());

    const { error: deleteErr } = await supabase
      .from("caregiver_qualifications")
      .delete()
      .eq("staff_profile_id", staffProfileId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    if (body.qualifications.length === 0) {
      return NextResponse.json({ qualifications: [] });
    }

    const { data, error: insertErr } = await supabase
      .from("caregiver_qualifications")
      .insert(
        body.qualifications.map((q) => ({
          staff_profile_id: staffProfileId,
          name: q.name,
          institution: q.institution ?? null,
          year: q.year ?? null,
        })),
      )
      .select("id, name, institution, year, verification_status");
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

    return NextResponse.json({
      qualifications: data.map((row) => ({
        id: row.id,
        name: row.name,
        institution: row.institution,
        year: row.year,
        verificationStatus: row.verification_status,
      })),
    });
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
