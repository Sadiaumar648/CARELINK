import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// Caregiver safety spec §8-10: police/fire/medical numbers must come from
// verified application configuration, never be guessed. platform_settings
// already grants read to any authenticated user (its RLS policy is
// "auth.role() = 'authenticated'", not admin-only) — the existing
// GET /api/admin/settings/[key] route is admin-gated in code, so this adds
// a narrow, read-only route for the three specific keys an SOS screen
// needs, rather than opening the admin route (and, with it, unrelated
// settings like commission_rate) to every role. Writing them stays on the
// existing admin PATCH /api/admin/settings/[key] — this route only reads.
const KEYS = [
  "police_emergency_number",
  "fire_emergency_number",
  "medical_emergency_number",
] as const;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", KEYS);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value as string | null]));
    return NextResponse.json({
      police: byKey.get("police_emergency_number") ?? null,
      fire: byKey.get("fire_emergency_number") ?? null,
      medical: byKey.get("medical_emergency_number") ?? null,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
