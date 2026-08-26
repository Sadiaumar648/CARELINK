import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireUser(request);
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const unreadCount = data.filter((n) => !n.read_at).length;
    return NextResponse.json({ notifications: data, unreadCount });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

// Marks every unread notification as read.
export async function PATCH(request: Request) {
  try {
    const { supabase, userId } = await requireUser(request);
    const { data, error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null)
      .select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ updated: data.length });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
