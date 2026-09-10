import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { reselectPreferredCaregiver } from "@/lib/services/dispatch";

const bodySchema = z.object({ staffProfileId: z.string().uuid() });

// "Choose Another Nanny" — the parent's explicit pick of a different
// nanny after their first choice declined or didn't respond. Re-targets
// the same care request at the new nanny and offers it only to them.
// Never called automatically; never starts a sequential search.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireRole(request, ["parent"]);
    const { staffProfileId } = bodySchema.parse(await request.json());

    const result = await reselectPreferredCaregiver(supabase, id, staffProfileId);
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
    if (error instanceof Error && error.message.includes("choose another nanny")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
