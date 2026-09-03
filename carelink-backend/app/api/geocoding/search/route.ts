import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { geocodeAddress } from "@/lib/services/geocoding";

// Proxies a parent's or caregiver's typed address to Nominatim, server
// side — keeps the identifying User-Agent and rate limiting in one
// place (lib/services/geocoding.ts) rather than duplicated in the
// browser, and means neither role ever calls a third-party service
// directly. Returns { result: null } (200, not an error) for "we
// couldn't resolve that address" — a normal, expected outcome the
// caller is meant to handle by asking the parent to refine it, not a
// server failure.
const bodySchema = z.object({ query: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  try {
    await requireRole(request, ["parent", "staff"]);
    const { query } = bodySchema.parse(await request.json());
    const result = await geocodeAddress(query);
    return NextResponse.json({ result });
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
