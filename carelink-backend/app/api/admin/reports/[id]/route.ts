import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveReportSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/reports/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    const body = resolveReportSchema.parse(await request.json());

    const { data: updated, error } = await supabase
      .from("reports")
      .update({
        status: body.status,
        resolved_at: body.status === "resolved" ? new Date().toISOString() : null,
        resolution_note: body.resolutionNote ?? null,
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ report: updated });
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
