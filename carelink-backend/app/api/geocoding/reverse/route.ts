import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { reverseGeocode } from "@/lib/services/geocoding";

// Proxies a "Use my current location" GPS fix to Nominatim, server side
// — same reasoning as /api/geocoding/search. { result: null } means the
// coordinates couldn't be resolved to an address; the caller still has
// the real coordinates from the device either way and can decide how to
// proceed (CareLink never fabricates a fallback address).
const bodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export async function POST(request: Request) {
  try {
    await requireRole(request, ["parent", "staff"]);
    const { latitude, longitude } = bodySchema.parse(await request.json());
    const result = await reverseGeocode(latitude, longitude);
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
