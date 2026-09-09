import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { joinOnboardingLinkSchema } from "@carelink/shared";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { placeholderStaffEmail } from "@/lib/invitations";

function extOf(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "bin";
}

// The self-registration counterpart to /api/auth/claim-invitation: no
// account exists yet to claim (a shared link has no single pre-created
// recipient — see api/admin/onboarding-links), so this route creates
// the caregiver's account directly from what they typed, atomically
// consuming one registration slot on the link via
// claim_onboarding_link_registration (migration
// 20260918000000_claim_onboarding_link_registration.sql). Unauthenticated
// by design, same as claim-invitation.
//
// Also creates a bare staff_profiles row (so /onboarding/caregiver's
// later PATCH has something to upsert into) and a lightweight
// verification_submissions row for the Ghana Card number + live photo
// collected on the join form — no ID-card photo, no reference contact
// (migration 20260919000000 made both nullable for exactly this case),
// so it lands in the admin's existing Verifications queue exactly like
// any other submission, just missing those two fields.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const body = joinOnboardingLinkSchema.parse({
      token: formData.get("token"),
      fullName: formData.get("fullName"),
      phone: formData.get("phone"),
      idDocumentNumber: formData.get("idDocumentNumber"),
      password: formData.get("password"),
    });
    const selfieFile = formData.get("selfieFile");
    if (!(selfieFile instanceof File)) {
      return NextResponse.json({ error: "Take a live photo before continuing" }, { status: 400 });
    }

    const admin = createServiceRoleClient();

    // users.phone is unique — checked here, before claiming a
    // registration slot, so a phone already on file (an existing
    // caregiver's, or a re-submitted attempt) gets a clear, specific
    // message instead of Supabase's generic "Database error creating
    // new user" (the underlying not-null-constraint trigger failure has
    // no way to surface a friendlier reason through auth.admin.createUser).
    const { data: existing, error: existingErr } = await admin
      .from("users")
      .select("id")
      .eq("phone", body.phone)
      .maybeSingle();
    if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
    if (existing) {
      return NextResponse.json(
        {
          error:
            "This phone number is already registered with CareLink. Try signing in instead, or use a different number.",
        },
        { status: 400 },
      );
    }

    const { data: claim, error: claimErr } = await admin
      .rpc("claim_onboarding_link_registration", { link_token: body.token })
      .single();
    if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
    if (!claim || !(claim as { ok: boolean }).ok) {
      return NextResponse.json(
        { error: "This onboarding link is no longer valid. Ask your agency for a new one." },
        { status: 400 },
      );
    }

    const email = placeholderStaffEmail(body.phone);
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        role: "staff",
        full_name: body.fullName,
        phone: body.phone,
        account_status: "active",
      },
    });

    if (createErr || !created.user) {
      // The slot was already claimed above — release it so a failed
      // attempt never permanently costs the link a real registration.
      await admin.rpc("release_onboarding_link_registration", { link_token: body.token });
      return NextResponse.json(
        { error: "Couldn't create your account. Check your details and try again." },
        { status: 400 },
      );
    }
    const userId = created.user.id;

    // A bare row, same pattern POST /api/wards uses for parent_profiles —
    // /onboarding/caregiver's own PATCH /api/staff/profile upserts the
    // real caregiverType/base location into it next.
    const { data: staffProfile, error: profileErr } = await admin
      .from("staff_profiles")
      .insert({ user_id: userId })
      .select("id")
      .single();

    // The account itself is real and valid even if what follows here
    // fails — never rolled back over a verification-data hiccup. The
    // caregiver can still complete /onboarding/caregiver and, if
    // needed, submit identity separately later via /onboarding/identity
    // (open to any staff role — see RequireRole in the onboarding layout).
    if (!profileErr && staffProfile) {
      const selfieBuffer = Buffer.from(await selfieFile.arrayBuffer());
      const selfiePath = `${userId}/selfie-${Date.now()}.${extOf(selfieFile)}`;
      const { error: uploadErr } = await admin.storage
        .from("identity-documents")
        .upload(selfiePath, selfieBuffer, { contentType: selfieFile.type });
      if (!uploadErr) {
        await admin.from("verification_submissions").insert({
          user_id: userId,
          id_document_type: "ghana_card",
          id_document_number: body.idDocumentNumber,
          selfie_path: selfiePath,
        });
      }
    }

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email,
      password: body.password,
    });
    if (signInErr || !signIn.session) {
      return NextResponse.json(
        { error: "Account created, but signing in failed — try signing in again" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
