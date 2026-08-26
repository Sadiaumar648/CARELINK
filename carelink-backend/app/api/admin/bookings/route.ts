import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 4.11 (bookings table), filterable by status and range.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    let query = supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (status) query = query.eq("status", status);
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ bookings: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
