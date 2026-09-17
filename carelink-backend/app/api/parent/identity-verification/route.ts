import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { getIdentityVerificationService } from "@/lib/services/identity-verification";

// Academic NIA/IVSP simulation (see lib/services/identity-verification.ts)
// — a parent's own identity check, kept entirely separate from the
// existing, real-admin-reviewed verification_submissions table (which
// still covers caregiver onboarding, unchanged). Every attempt is kept,
// never overwritten, mirroring verification_submissions' own pattern.
const submitSchema = z.object({
  ghanaCardPin: z.string().trim().min(1, "Enter your Ghana Card PIN"),
  dateOfBirth: z.string().trim().min(1, "Enter your date of birth"),
});

function extOf(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "jpg";
}

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);
    const formData = await request.formData();

    const body = submitSchema.parse({
      ghanaCardPin: formData.get("ghanaCardPin"),
      dateOfBirth: formData.get("dateOfBirth"),
    });

    const selfieFile = formData.get("selfieFile");
    if (!(selfieFile instanceof File)) {
      return NextResponse.json({ error: "Take a live selfie to continue" }, { status: 400 });
    }

    const { data: caller, error: callerErr } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", userId)
      .single();
    if (callerErr || !caller) {
      return NextResponse.json({ error: "Could not load your account" }, { status: 400 });
    }

    const selfieBuffer = Buffer.from(await selfieFile.arrayBuffer());
    const selfiePath = `${userId}/nia-selfie-${Date.now()}.${extOf(selfieFile)}`;
    const { error: uploadErr } = await supabase.storage
      .from("identity-documents")
      .upload(selfiePath, selfieBuffer, { contentType: selfieFile.type });
    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 400 });
    }

    // The simulation itself — no external request, no real NIA record.
    // See lib/services/identity-verification.ts for exactly what this
    // does and why.
    const result = await getIdentityVerificationService().verifyIdentity({
      ghanaCardPin: body.ghanaCardPin,
      dateOfBirth: body.dateOfBirth,
      fullName: caller.full_name,
    });

    const { data: saved, error: insertErr } = await supabase
      .from("parent_identity_verifications")
      .insert({
        user_id: userId,
        status: result.status,
        provider: result.provider,
        pin_match: result.pinMatch,
        biodata_match: result.biodataMatch,
        biometric_match: result.biometricMatch,
        failure_reason: result.failureReason,
        verified_name: result.verifiedName,
        verified_date_of_birth: result.verifiedDateOfBirth,
        selfie_path: selfiePath,
        verification_reference: result.verificationReference,
      })
      .select()
      .single();
    if (insertErr || !saved) {
      return NextResponse.json(
        { error: insertErr?.message ?? "Could not save verification result" },
        { status: 400 },
      );
    }

    // Column-level grants on public.users only let a user update their
    // own full_name/phone/email/last_seen_at (see
    // 20260826060000_core_users_and_profiles.sql) — verification_status
    // and verification_method are service_role-only by design, the same
    // narrow, already-authorized escalation the accept/end booking
    // routes already use, and only reached here after this attempt's
    // own row has already been saved above under normal RLS.
    if (result.status === "verified") {
      await createServiceRoleClient()
        .from("users")
        .update({ verification_status: "verified", verification_method: "carelink" })
        .eq("id", userId);
    }

    return NextResponse.json(
      {
        result: {
          status: result.status,
          provider: result.provider,
          pinMatch: result.pinMatch,
          biodataMatch: result.biodataMatch,
          biometricMatch: result.biometricMatch,
          verifiedName: result.verifiedName,
          verifiedDateOfBirth: result.verifiedDateOfBirth,
          verificationReference: result.verificationReference,
          failureReason: result.failureReason,
          createdAt: saved.created_at,
        },
      },
      { status: 201 },
    );
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

const PHOTO_SIGNED_URL_TTL_SECONDS = 300;

// The caller's own most recent attempts — RLS
// (parent_identity_verifications_owner_read) already scopes this to the
// signed-in parent's own rows; nothing here can return another parent's
// result.
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent"]);

    const { data, error } = await supabase
      .from("parent_identity_verifications")
      .select(
        "status, provider, pin_match, biodata_match, biometric_match, failure_reason, verified_name, verified_date_of_birth, verification_reference, selfie_path, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The most recent attempt's own selfie, as a short-lived signed URL
    // — the same "profile photo" convention GET /api/verification/
    // submissions already uses, so ProfilePhoto on /parent/account picks
    // this up the same way once a parent verifies through this flow.
    const latestSelfiePath = data.find((a) => a.selfie_path)?.selfie_path ?? null;
    const photoUrl = latestSelfiePath
      ? ((
          await supabase.storage
            .from("identity-documents")
            .createSignedUrl(latestSelfiePath, PHOTO_SIGNED_URL_TTL_SECONDS)
        ).data?.signedUrl ?? null)
      : null;

    return NextResponse.json({ attempts: data, photoUrl });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
