import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { cancelDispatch } from "@/lib/services/dispatch";

// Stops future offers and expires the current one, if any. Never
// cancels a request a caregiver has already accepted (cancelDispatch
// guards on dispatch_status != 'accepted') — at that point the real
// booking exists and the existing booking-cancellation flow is the
// correct path, not this one.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);
    await cancelDispatch(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
