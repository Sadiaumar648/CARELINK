import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { generateInvitationCode } from "@/lib/invitations";

// Admin's "Generate Caregiver Onboarding Link" — a real, admin-managed
// shareable link, backed by migration 20260914000000_caregiver_onboarding_links.sql.
// Token is plaintext (see that migration's own comment for why — this
// is a re-copyable shared link, not a one-time private secret like
// invitation codes); admin-only RLS is what actually protects it.
const createSchema = z.object({
  expiryDays: z.number().int().positive().nullable(),
  maxRegistrations: z.number().int().min(1).max(10000),
});

type LinkRow = {
  id: string;
  token: string;
  label: string;
  max_registrations: number;
  registration_count: number;
  expires_at: string | null;
  status: "active" | "deactivated";
  deactivated_at: string | null;
  created_at: string;
};

// The stored status only ever distinguishes admin-controlled active/
// deactivated — "Expired" and "Limit reached" are computed here, at
// read time, from real expires_at/registration_count values, the same
// lazy-computation idiom the payment window already uses elsewhere in
// this app (never a stored, driftable status for something time-based).
function displayStatus(row: LinkRow): "Active" | "Deactivated" | "Expired" | "Limit reached" {
  if (row.status === "deactivated") return "Deactivated";
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return "Expired";
  if (row.registration_count >= row.max_registrations) return "Limit reached";
  return "Active";
}

function serialize(row: LinkRow) {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    maxRegistrations: row.max_registrations,
    registrationCount: row.registration_count,
    expiresAt: row.expires_at,
    status: displayStatus(row),
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data, error } = await supabase
      .from("caregiver_onboarding_links")
      .select(
        "id, token, label, max_registrations, registration_count, expires_at, status, deactivated_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ links: (data as LinkRow[]).map(serialize) });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["admin"]);
    const body = createSchema.parse(await request.json());

    const token = generateInvitationCode(32);
    const expiresAt =
      body.expiryDays === null
        ? null
        : new Date(Date.now() + body.expiryDays * 86400000).toISOString();

    const { data, error } = await supabase
      .from("caregiver_onboarding_links")
      .insert({
        token,
        created_by: userId,
        max_registrations: body.maxRegistrations,
        expires_at: expiresAt,
      })
      .select(
        "id, token, label, max_registrations, registration_count, expires_at, status, deactivated_at, created_at",
      )
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ link: serialize(data as LinkRow) }, { status: 201 });
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
