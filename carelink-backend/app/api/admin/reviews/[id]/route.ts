import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin review moderation — hides or restores a review using the
// existing reviews.hidden_by_admin / hidden_reason columns (migration
// 20260827200000_messaging_reviews_reports.sql already has these; no
// schema change here). Runs on the admin's own RLS-scoped client:
// "reviews_update_staff_or_admin" already permits this. Updating the
// row also re-fires recalculate_staff_rating_upd, so a hidden review
// drops out of the caregiver's public rating_avg/rating_count
// automatically, the same way it already does for a staff response.
const patchSchema = z.object({
  hidden: z.boolean(),
  hiddenReason: z.string().trim().min(1).max(500).optional(),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const { data: updated, error } = await supabase
      .from("reviews")
      .update({
        hidden_by_admin: body.hidden,
        hidden_reason: body.hidden ? (body.hiddenReason ?? null) : null,
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ review: updated });
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
