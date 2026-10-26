import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// The first call carelink-frontend makes after sign-in: who is this, and
// which role's shell should they land on (doc 3, App Flow, §1).
// verificationStatus is included so a page like claim-invitation can
// tell "already verified" (including an existing agency user verified
// at admin-invite time, who never goes through /verify-identity at all)
// apart from "needs to go through the wizard", without a second route.
export async function GET(request: Request) {
  try {
    const { supabase, userId, role } = await requireUser(request);
    const { data } = await supabase
      .from("users")
      .select("verification_status, verification_method")
      .eq("id", userId)
      .single();
    return NextResponse.json({
      id: userId,
      role,
      verificationStatus: data?.verification_status ?? "unverified",
      verificationMethod: data?.verification_method ?? null,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
