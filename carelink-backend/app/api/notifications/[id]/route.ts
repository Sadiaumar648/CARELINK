import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

export async function PATCH(request: Request, ctx: RouteContext<"/api/notifications/[id]">) {
  try {
    const { supabase } = await requireUser(request);
    const { id } = await ctx.params;

    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ notification: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
