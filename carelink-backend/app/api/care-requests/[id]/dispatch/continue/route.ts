import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { continuePreferredDispatch } from "@/lib/services/dispatch";

// The parent's explicit "Find another caregiver" — the only way past a
// preferred caregiver who declined, didn't respond, or wasn't eligible
// (dispatch_status 'preferred_declined'). Never called automatically;
// only a real click on that specific screen reaches this route.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);
    const result = await continuePreferredDispatch(supabase, id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes("preferred-caregiver decision")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
