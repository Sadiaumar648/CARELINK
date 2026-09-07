import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin's "Pause New Requests" / "Resume New Requests" — connects the
// existing staff_profiles.accepting_bookings column (already the real
// gate public_caregivers/search/dispatch all read) to a real admin
// write, the same way an earlier change wired up account_status
// 'suspended'. Deliberately NOT staff_profiles.dispatch_available —
// that's the live Go Available/Off Duty toggle, owned only by the
// caregiver themselves; this route never touches it. Runs on the
// admin's own RLS-scoped client: staff_profiles_admin already permits
// this (a for-all admin policy), no service role needed.
const patchSchema = z.object({
  acceptingBookings: z.boolean(),
});

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/roster/[staffProfileId]">,
) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { staffProfileId } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("staff_profiles")
      .update({ accepting_bookings: body.acceptingBookings })
      .eq("id", staffProfileId)
      .select("id, accepting_bookings")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ staffProfile: data });
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
