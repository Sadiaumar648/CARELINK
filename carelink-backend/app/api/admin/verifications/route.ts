import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Task 3.4. Oldest first, both roles on one queue.
export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const status = new URL(request.url).searchParams.get("status") ?? "pending";

    const { data, error } = await supabase
      .from("verification_submissions")
      .select("*, users!verification_submissions_user_id_fkey(full_name, phone, role)")
      .eq("status", status)
      .order("created_at", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ submissions: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
