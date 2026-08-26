import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const status = new URL(request.url).searchParams.get("status");

    let query = supabase
      .from("reports")
      .select(
        "*, reporter:users!reports_reporter_id_fkey(full_name), subject:users!reports_subject_user_id_fkey(full_name, role)",
      )
      .order("created_at", { ascending: true });
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reports: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
