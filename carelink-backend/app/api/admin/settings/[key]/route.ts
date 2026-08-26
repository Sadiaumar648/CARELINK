import { NextResponse } from "next/server";
import { z } from "zod";
import { updatePlatformSettingSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 4.12: commission rate, request-expiry hours, image-retention days
// — read via GET /api/admin/settings/<key> (or list all with no key
// filter through the plain table read below).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/settings/[key]">) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { key } = await ctx.params;
    const { data, error } = await supabase
      .from("platform_settings")
      .select("*")
      .eq("key", key)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ setting: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

// A commission-rate change affects only future completions — the split
// on an already-completed booking's payment is fixed at settlement time
// (task 3.9), never recomputed retroactively by this route.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/settings/[key]">) {
  try {
    const { supabase, userId } = await requireRole(request, ["admin"]);
    const { key } = await ctx.params;
    const body = updatePlatformSettingSchema.parse(await request.json());

    const { data, error } = await supabase
      .from("platform_settings")
      .upsert({ key, value: body.value, updated_by: userId })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ setting: data });
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
