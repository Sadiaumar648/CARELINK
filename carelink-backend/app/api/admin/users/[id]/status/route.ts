import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Connects Admin's Reviews moderation to the account-status control
// CareLink's schema already has: users.account_status already accepts
// 'active' | 'suspended' (migration 20260826060000_core_users_and_profiles.sql),
// but until now nothing ever wrote 'suspended' — this is the missing
// wire, not a new moderation system. The users table's column grant
// (same migration) restricts `authenticated` to updating only
// full_name/phone/email/last_seen_at, so this — like staff/parent
// invitation issuance — has to run on the service-role client, after an
// explicit admin-role check here.
const patchSchema = z.object({
  accountStatus: z.enum(["active", "suspended"]),
});

export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/users/[id]/status">) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    const body = patchSchema.parse(await request.json());

    const admin = createServiceRoleClient();

    const { data: target, error: targetErr } = await admin
      .from("users")
      .select("id, role, account_status")
      .eq("id", id)
      .maybeSingle();
    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 500 });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (target.role === "admin") {
      return NextResponse.json(
        { error: "An admin account's status can't be changed here" },
        { status: 400 },
      );
    }

    const { data: updated, error } = await admin
      .from("users")
      .update({ account_status: body.accountStatus })
      .eq("id", id)
      .select("id, account_status")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ user: updated });
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
