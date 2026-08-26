import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// Task 2.9. Rendered from the public_caregivers view only (doc 5 §6) — no
// private column (emergency contact, ID documents, etc.) is reachable
// through this route, because none of them are in the view to begin with.
export async function GET(request: Request, ctx: RouteContext<"/api/caregivers/[id]">) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("public_caregivers")
      .select("*")
      .eq("staff_profile_id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ caregiver: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
