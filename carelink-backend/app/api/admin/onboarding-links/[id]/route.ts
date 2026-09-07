import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Only "deactivate" is implemented — "View registrations" isn't,
// deliberately: no real registration ever happened through this link
// (the /caregiver/join/[token] self-registration page doesn't exist
// yet), so there is nothing real to show. Not built here rather than
// faked.
const patchSchema = z.object({
  action: z.literal("deactivate"),
});

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/admin/onboarding-links/[id]">,
) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    patchSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("caregiver_onboarding_links")
      .update({ status: "deactivated", deactivated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
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
