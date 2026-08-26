import { NextResponse } from "next/server";
import { z } from "zod";
import { parseSearchQuerySchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { parseNaturalLanguageSearch } from "@/lib/services/nl-search";

// Task 4.4. Returns filters as editable chips for the parent to confirm
// before /api/search/caregivers runs (doc 3, App Flow, §3.1) — this
// route never searches by itself. On failure (malformed output or a
// provider outage), filters is null and the frontend falls back to the
// manual filter panel with the parent's text preserved.
export async function POST(request: Request) {
  try {
    await requireRole(request, ["parent"]);
    const body = parseSearchQuerySchema.parse(await request.json());

    const filters = await parseNaturalLanguageSearch(body.query);
    return NextResponse.json({ filters, query: body.query });
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
