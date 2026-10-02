import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAssistantMessageSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { runAdminAssistantTurn } from "@/lib/services/admin-assistant";

// One turn of the admin's read-only Q&A assistant. Stateless — the
// client sends the full visible transcript each time, same pattern as
// /api/care-assistant/message. Runs entirely on the calling admin's own
// RLS-scoped client, read-only tools only — this route never writes to
// the database. A missing ANTHROPIC_API_KEY (or any provider failure)
// returns a clear error rather than faking a reply.
export async function POST(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const body = adminAssistantMessageSchema.parse(await request.json());

    const reply = await runAdminAssistantTurn(body.messages, supabase);
    if (reply == null) {
      return NextResponse.json(
        { error: "The assistant isn't available right now — try again shortly." },
        { status: 503 },
      );
    }

    return NextResponse.json({ reply });
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
