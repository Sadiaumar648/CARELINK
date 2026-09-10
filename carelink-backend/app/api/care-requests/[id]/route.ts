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

    // Every caregiver this request has already been offered to and that
    // fell through (declined / no response / released) — so the "choose
    // another nanny" screen never lists someone the parent has already
    // tried for this exact request. Read-only; RLS (bookings_owner)
    // already scopes this to the caller's own bookings.
    const { data: priorOffers } = await supabase
      .from("bookings")
      .select("staff_profile_id, status")
      .eq("care_request_id", id)
      .in("status", ["declined", "expired", "cancelled"]);
    const tried = new Set((priorOffers ?? []).map((b) => b.staff_profile_id as string));
    // The nanny currently on the request when it's paused at
    // preferred_declined is one the parent has already tried, even in
    // the edge case where she went unavailable before any offer row was
    // ever written.
    if (
      careRequest.dispatch_status === "preferred_declined" &&
      careRequest.preferred_staff_profile_id
    ) {
      tried.add(careRequest.preferred_staff_profile_id as string);
    }
    const triedStaffProfileIds = Array.from(tried);

    return NextResponse.json({ careRequest, triedStaffProfileIds });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
