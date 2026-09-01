import { NextResponse } from "next/server";
import { z } from "zod";
import { createStaffInviteSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import {
  generateInvitationCode,
  hashInvitationCode,
  placeholderStaffEmail,
} from "@/lib/invitations";

// Task 1.8: an administrator places a caregiver on the roster directly —
// this is how the agency already recruits (doc 1, PRD, §1). The record is
// created as account_status "invited" and cannot be booked or searched
// until the caregiver claims it (task 1.9) and completes their profile
// (task 2.1).
export async function POST(request: Request) {
  try {
    const { userId: adminId } = await requireRole(request, ["admin"]);

    const body = createStaffInviteSchema.parse(await request.json());
    const admin = createServiceRoleClient();

    // A real email, when the admin has one on file for an existing
    // caregiver, replaces the placeholder — see createStaffInviteSchema
    // for why. Still falls back to the placeholder for the normal
    // brand-new-caregiver case, unchanged.
    const email = body.email ?? placeholderStaffEmail(body.phone);
    const code = generateInvitationCode();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: generateInvitationCode(16), // throwaway — replaced when the invitation is claimed
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: body.fullName,
        phone: body.phone,
        account_status: "invited",
        invited_by: adminId,
      },
    });

    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create the staff account" },
        { status: 400 },
      );
    }

    const { error: updateErr } = await admin
      .from("users")
      .update({
        invitation_code_hash: hashInvitationCode(code),
        agency_reference_id: body.agencyReferenceId ?? null,
        // The admin's explicit attestation that the agency already
        // verified this person — never assumed, only ever set when the
        // caller checked the box. Writes the exact same verification_status
        // column the document-review flow (verification_submissions
        // decision) already writes, so every existing "is this account
        // verified" check elsewhere in the app keeps working unmodified;
        // verification_method records which of the two paths this was,
        // for display only.
        ...(body.agencyVerified
          ? { verification_status: "verified" as const, verification_method: "agency" as const }
          : {}),
      })
      .eq("id", created.user.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // The plaintext code is returned exactly once, to the administrator
    // who will relay it to the caregiver — only its hash is ever stored.
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
