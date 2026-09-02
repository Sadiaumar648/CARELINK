import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { advanceDispatch } from "@/lib/services/dispatch";

// The polled status endpoint — this call itself is what evaluates
// whether the current offer has timed out and advances the queue (see
// lib/services/dispatch.ts and lib/dispatch-config.ts for why no cron
// is needed for the live path). Called every few seconds by the parent's
// active-search screen, the same polling pattern this app already uses
// for payment status (usePaymentPolling) and SafeTrack location.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);
    const result = await advanceDispatch(supabase, id);
    return NextResponse.json(result);
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
