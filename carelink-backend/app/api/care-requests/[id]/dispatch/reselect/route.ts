import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { reassignCaregiver } from "@/lib/services/dispatch";

const bodySchema = z.object({ staffProfileId: z.string().uuid() });

// "Browse other caregivers" — the parent doesn't want the
// auto-assigned caregiver and picks someone else themselves. Cancels
// the current assignment and assigns the new caregiver directly, in
// the same call — no waiting, since neither caregiver ever has to
// respond. Legal any time the request currently has an active,
// unpaid assignment.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);
    const { staffProfileId } = bodySchema.parse(await request.json());

    const result = await reassignCaregiver(supabase, id, staffProfileId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.name === "NannyUnavailable") {
      return NextResponse.json(
        { error: error.message, code: "nanny_unavailable" },
        { status: 400 },
      );
    }
    if (error instanceof Error && error.message.includes("active assignment")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
