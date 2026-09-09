import { NextResponse } from "next/server";
import { z } from "zod";
import { careAssistantMessageSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { runCareAssistantTurn } from "@/lib/services/care-assistant";

// One turn of the CareLink AI conversation. Stateless — the client sends
// the full visible transcript and its current draft each time, same as
// /api/search/parse is a stateless single-shot call. This route never
// touches the matching engine, never writes to the database, and never
// decides anything: it only ever returns a proposed structured draft and
// an advisory Nanny/Babysitter recommendation for the parent to confirm
// or override on the frontend. A missing ANTHROPIC_API_KEY (or any
// provider failure) returns a clear error rather than faking a reply.
export async function POST(request: Request) {
  try {
    await requireRole(request, ["parent"]);
    const body = careAssistantMessageSchema.parse(await request.json());

    const result = await runCareAssistantTurn(body.messages, body.draft);
    if (!result) {
      return NextResponse.json(
        {
          error: "Nia isn't available right now — try the direct Nanny/Babysitter option.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
