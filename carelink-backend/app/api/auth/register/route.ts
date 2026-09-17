import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { z } from "zod";
import { registerParentSchema } from "@carelink/shared";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Self-service parent sign-up, created server-side with email_confirm
// true — the same technique every other account-creation path in this
// app already uses (admin-invited parents/caregivers, the demo
// accounts), and for the same reason: Supabase's client-side signUp()
// only returns a session once the project's own "Confirm email" setting
// is satisfied, which means actually sending a real email through
// Supabase's built-in mailer — something this project has hit real
// delivery failures on ("Error sending confirmation email"), not just
// an extra step. Going through the admin API here sidesteps that
// mailer entirely, so registration works the same way regardless of
// that project setting. No session exists yet when this is called, so
// it's unauthenticated by design — mirrors
// /api/auth/claim-invitation's exact shape: create/update the account
// with the service role, sign in server-side, hand the tokens back so
// the frontend can call supabase.auth.setSession directly.
export async function POST(request: Request) {
  try {
    const body = registerParentSchema.parse(await request.json());
    const admin = createServiceRoleClient();

    const { data: existing } = await admin
      .from("users")
      .select("id")
      .eq("email", body.email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try logging in instead." },
        { status: 400 },
      );
    }

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        role: "parent",
        full_name: body.fullName,
        phone: body.phone,
        account_status: "active",
      },
    });
    if (createErr || !created.user) {
      return NextResponse.json(
        { error: createErr?.message ?? "Could not create your account" },
        { status: 400 },
      );
    }

    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    );
    const { data: signIn, error: signInErr } = await anon.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });
    if (signInErr || !signIn.session) {
      return NextResponse.json(
        { error: "Account created, but signing you in failed — try logging in." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        accessToken: signIn.session.access_token,
        refreshToken: signIn.session.refresh_token,
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
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
