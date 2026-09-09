import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Public, unauthenticated by necessity — a caregiver opening a shared
// onboarding link has no account yet to authenticate with. Mirrors
// claim-invitation's own unauthenticated-but-service-role-backed read
// pattern. Only enough is returned to render (or refuse) the join
// form — never registration_count/max_registrations, which aren't this
// caller's business.
type LinkRow = {
  id: string;
  label: string;
  max_registrations: number;
  registration_count: number;
  expires_at: string | null;
  status: "active" | "deactivated";
};

export async function GET(request: Request, ctx: RouteContext<"/api/onboarding-links/[token]">) {
  const { token } = await ctx.params;
  const admin = createServiceRoleClient();

  const { data, error } = await admin
    .from("caregiver_onboarding_links")
    .select("id, label, max_registrations, registration_count, expires_at, status")
    .eq("token", token)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ valid: false, reason: "not_found" });

  const row = data as LinkRow;
  if (row.status === "deactivated")
    return NextResponse.json({ valid: false, reason: "deactivated" });
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ valid: false, reason: "expired" });
  }
  if (row.registration_count >= row.max_registrations) {
    return NextResponse.json({ valid: false, reason: "limit_reached" });
  }

  return NextResponse.json({ valid: true, label: row.label });
}
