import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { advanceDispatch } from "@/lib/services/dispatch";

// Starts (or resumes) sequential dispatch for a care_requests row.
// Idempotent — safe to call more than once, e.g. if a parent navigates
// back to an already-started search screen. Location is enforced well
// before this ever runs: createCareRequestSchema requires it and the
// database column itself is NOT NULL with a non-empty check, so a
// care_requests row cannot exist without one — this is a defensive
// second check, not the only one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);

    const { data: careRequest, error } = await supabase
      .from("care_requests")
      .select("id, location, dispatch_status, dispatch_started_at")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!careRequest)
      return NextResponse.json({ error: "Care request not found" }, { status: 404 });
    if (!careRequest.location?.trim()) {
      return NextResponse.json(
        { error: "Add a care location before starting a search" },
        { status: 400 },
      );
    }

    if (!careRequest.dispatch_started_at) {
      await supabase
        .from("care_requests")
        .update({ dispatch_status: "searching", dispatch_started_at: new Date().toISOString() })
        .eq("id", id);
    }

    const result = await advanceDispatch(supabase, id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
