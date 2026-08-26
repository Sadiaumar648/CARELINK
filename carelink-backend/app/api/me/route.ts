import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

// The first call carelink-frontend makes after sign-in: who is this, and
// which role's shell should they land on (doc 3, App Flow, §1).
export async function GET(request: Request) {
  try {
    const { userId, role } = await requireUser(request);
    return NextResponse.json({ id: userId, role });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
