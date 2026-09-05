import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Admin review moderation for BOTH directions — hides or restores a
// review using each table's own hidden_by_admin/hidden_reason columns
// (reviews already had these; caregiver_reviews was given the same
// shape in migration 20260913000000_caregiver_reviews.sql). `direction`
// picks which table this id belongs to — the two are separate uuid
// spaces with no shared id column to disambiguate otherwise. Runs on
// the admin's own RLS-scoped client: reviews_update_staff_or_admin and
// caregiver_reviews_update_admin both already permit this. Updating
// either row re-fires that table's own rating-recalculation trigger, so
// a hidden review drops out of the relevant rating_avg/rating_count
// automatically.
const patchSchema = z.object({
  hidden: z.boolean(),
  hiddenReason: z.string().trim().min(1).max(500).optional(),
  direction: z.enum(["parent_to_caregiver", "caregiver_to_parent"]),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/reviews/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const table = body.direction === "parent_to_caregiver" ? "reviews" : "caregiver_reviews";

    const { data: updated, error } = await supabase
      .from(table)
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
