import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { joinOnboardingLinkSchema } from "@carelink/shared";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { placeholderStaffEmail } from "@/lib/invitations";

// The self-registration counterpart to /api/auth/claim-invitation: no
// account exists yet to claim (a shared link has no single pre-created
// recipient — see api/admin/onboarding-links), so this route creates
// the caregiver's account directly from what they typed, atomically
// consuming one registration slot on the link via
// claim_onboarding_link_registration (migration
// 20260918000000_claim_onboarding_link_registration.sql). Unauthenticated
// by design, same as claim-invitation.
//
// No identity document or photo is collected — only staff the agency
// has already trained and approved ever receive this link, so the
// link itself is the verification. The account is marked verified
// (verification_method "agency") the moment it's created, the same
// attestation api/admin/staff's own agencyVerified checkbox writes.
//
// Also creates a bare staff_profiles row (so /onboarding/caregiver's
// later PATCH has something to upsert into).
export async function POST(request: Request) {
  try {
    const body = joinOnboardingLinkSchema.parse(await request.json());

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
    await admin.from("staff_profiles").insert({ user_id: userId });

    // The agency's attestation that this person is already trained and
    // approved, same as api/admin/staff's agencyVerified checkbox — never
    // rolled back over this write failing, the account itself is still
    // real and valid either way.
    await admin
      .from("users")
      .update({ verification_status: "verified", verification_method: "agency" })
      .eq("id", userId);

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
