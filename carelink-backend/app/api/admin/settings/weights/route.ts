import { NextResponse } from "next/server";
import { z } from "zod";
import { updateWeightsSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

const FACTOR_KEYS = {
  availability: "availability",
  area: "area",
  skills: "skills",
  ratingExperience: "rating_experience",
  budget: "budget",
} as const;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { data, error } = await supabase
      .from("match_weights")
      .select("factor, weight, updated_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ weights: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

// Task 4.12: an invalid weight set (doesn't sum to 1) is refused. A
// change takes effect on the next search immediately, and is itself
// recorded (updated_by/updated_at) so a ranking change can be attributed.
export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["admin"]);
    const body = updateWeightsSchema.parse(await request.json());

    const sum = body.availability + body.area + body.skills + body.ratingExperience + body.budget;
    if (Math.abs(sum - 1) > 0.005) {
      return NextResponse.json({ error: "Weights must sum to 1" }, { status: 400 });
    }

    const rows = Object.entries(FACTOR_KEYS).map(([inputKey, factor]) => ({
      factor,
      weight: body[inputKey as keyof typeof FACTOR_KEYS],
      updated_by: userId,
    }));

    const { data, error } = await supabase.from("match_weights").upsert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ weights: data });
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
