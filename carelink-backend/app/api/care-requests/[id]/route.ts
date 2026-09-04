import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// "Request Care Again" (the exhausted-dispatch retry flow): the one
// real place the parent's saved care_requests row is read back so the
// request form can restore from it — never from fragile frontend-only
// state, so it survives a refresh or a fresh visit to the same link.
// RLS alone decides what comes back (care_requests_owner, 20260903000000,
// already covers a plain select on the caller's own RLS-scoped client);
// no new policy needed. Read-only — this route never creates, updates,
// or duplicates anything.
export async function GET(request: Request, ctx: RouteContext<"/api/care-requests/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["parent"]);
    const { id } = await ctx.params;

    const { data: careRequest, error } = await supabase
      .from("care_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!careRequest) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ careRequest });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
