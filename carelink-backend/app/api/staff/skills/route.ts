import { NextResponse } from "next/server";
import { z } from "zod";
import { staffSkillsSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// Task 2.2. Replaces the full set on every PUT — simpler and just as
// correct as a diff at this scale, and it's what "a tapped set of large
// labelled cards" (doc 3, App Flow, §2.3) naturally submits.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("staff_skills")
      .select("skill")
      .eq("staff_profile_id", staffProfileId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ skills: data.map((row) => row.skill) });
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

    const body = staffSkillsSchema.parse(await request.json());

    const { error: deleteErr } = await supabase
      .from("staff_skills")
      .delete()
      .eq("staff_profile_id", staffProfileId);
    if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 });

    if (body.skills.length > 0) {
      const { error: insertErr } = await supabase
        .from("staff_skills")
        .insert(body.skills.map((skill) => ({ staff_profile_id: staffProfileId, skill })));
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
    }

    return NextResponse.json({ skills: body.skills });
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
