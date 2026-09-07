import { NextResponse } from "next/server";
import { z } from "zod";
import { createParentInviteSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import {
  generateInvitationCode,
  hashInvitationCode,
  placeholderStaffEmail,
} from "@/lib/invitations";

// Mirrors POST /api/admin/staff exactly (see that route for the reasoning
// behind email/agencyVerified) — the only place this genuinely differs is
// role: "parent" and the profile the invited person completes themselves
// afterward (parent_profiles + wards, via the same self-service flow any
// new parent already uses, rather than staff_profiles). Reuses
// placeholderStaffEmail from lib/invitations.ts unchanged: despite the
// name, it's just "a syntactically valid, never-shown placeholder email
// derived from a phone number" — nothing in it is staff-specific.
export async function POST(request: Request) {
  try {
    const { userId: adminId } = await requireRole(request, ["admin"]);

    const body = createParentInviteSchema.parse(await request.json());
    const admin = createServiceRoleClient();

    const email = body.email ?? placeholderStaffEmail(body.phone);
    const code = generateInvitationCode();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: generateInvitationCode(16), // throwaway — replaced when the invitation is claimed
      email_confirm: true,
      user_metadata: {
        role: "parent",
        full_name: body.fullName,
        phone: body.phone,
        account_status: "invited",
        invited_by: adminId,
      },
    });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create the parent account" },
        { status: 400 },
      );
    }

    const { error: updateErr } = await admin
      .from("users")
      .update({
        invitation_code_hash: hashInvitationCode(code),
        agency_reference_id: body.agencyReferenceId ?? null,
        ...(body.agencyVerified
          ? { verification_status: "verified" as const, verification_method: "agency" as const }
          : {}),
      })
      .eq("id", created.user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ id: created.user.id, invitationCode: code }, { status: 201 });
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

// No admin parent-list route existed before this (parent_profiles
// already has an admin-read RLS policy that was simply never used by any
// route). Mirrors GET /api/admin/roster's shape and pattern.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data, error } = await supabase
      .from("users")
      .select(
        "id, full_name, phone, email, account_status, verification_status, verification_method, agency_reference_id, invited_by, created_at, parent_profiles(id, area)",
      )
      .eq("role", "parent")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const parents = data.map((row) => {
      const profile = Array.isArray(row.parent_profiles)
        ? row.parent_profiles[0]
        : row.parent_profiles;
      return {
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        accountStatus: row.account_status,
        verificationStatus: row.verification_status,
        verificationMethod: row.verification_method,
        agencyReferenceId: row.agency_reference_id,
        existingAgencyUser: row.invited_by !== null,
        // account_status flips from "invited" to "active" the moment
        // /api/auth/claim-invitation succeeds — no separate flag needed.
        invitationStatus:
          row.invited_by === null ? null : row.account_status === "invited" ? "pending" : "claimed",
        profileComplete: Boolean(profile),
        parentProfileId: profile?.id ?? null,
        area: profile?.area ?? null,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ parents });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
