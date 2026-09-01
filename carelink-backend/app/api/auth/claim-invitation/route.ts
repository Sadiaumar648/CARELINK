import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { claimInvitationSchema } from "@carelink/shared";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { hashInvitationCode } from "@/lib/invitations";

// Task 1.9: claiming an existing roster record rather than creating a
// second one (doc 3, App Flow, §2.3 step 1). No session exists yet, so
// this route is unauthenticated by design and relies entirely on the
// code+phone pair matching what task 1.8 issued.
export async function POST(request: Request) {
  try {
    const body = claimInvitationSchema.parse(await request.json());
    const admin = createServiceRoleClient();

    // Not restricted to role "staff": account_status "invited" already
    // uniquely identifies "an account an administrator created via an
    // invite flow, awaiting claim" regardless of role — the admin
    // parent-invite route (api/admin/parents) sets the exact same
    // status, so an existing parent claims through this identical path.
    const { data: userRow, error: lookupErr } = await admin
      .from("users")
      .select("id, role, invitation_code_hash, account_status, email")
      .eq("phone", body.phone)
      .maybeSingle();

    if (lookupErr) {
      return NextResponse.json({ error: lookupErr.message }, { status: 500 });
    }
    if (!userRow || userRow.account_status !== "invited") {
      return NextResponse.json(
        { error: "No pending invitation found for this phone number" },
        { status: 400 },
      );
    }
    if (userRow.invitation_code_hash !== hashInvitationCode(body.code)) {
      return NextResponse.json({ error: "Incorrect invitation code" }, { status: 400 });
    }

    const { error: passwordErr } = await admin.auth.admin.updateUserById(userRow.id, {
      password: body.password,
    });
    if (passwordErr) {
      return NextResponse.json({ error: passwordErr.message }, { status: 500 });
    }

    const { error: activateErr } = await admin
      .from("users")
      .update({ account_status: "active", invitation_code_hash: null })
      .eq("id", userRow.id);
    if (activateErr) {
      return NextResponse.json({ error: activateErr.message }, { status: 500 });
    }

    // Signs the newly-claimed account in server-side and hands the tokens
    // back so carelink-frontend can call supabase.auth.setSession directly
    // — the caregiver never sees or needs the placeholder email their
    // account was created with (see lib/invitations.ts).
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: userRow.email as string,
      password: body.password,
    });
    if (signInErr || !signIn.session) {
      return NextResponse.json(
        { error: "Account claimed, but signing in failed — try signing in again" },
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
