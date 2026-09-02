import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Safety net only — NOT the primary dispatch-advance mechanism. The
// parent's own poll of GET /api/care-requests/[id]/dispatch already
// advances the queue on every tick (see lib/services/dispatch.ts); this
// only exists for the case where nobody is polling at all (the parent
// closed the tab), so a request isn't left silently "searching" forever.
// Same Vercel Cron pattern as /api/internal/retention: invoked as a GET
// with an automatic `Authorization: Bearer $CRON_SECRET` header (see
// vercel.json). A day is a generous, deliberately non-time-critical
// threshold — this is cleanup, not the live experience.
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();

  const { data: abandoned, error } = await supabase
    .from("care_requests")
    .select("id")
    .in("dispatch_status", ["searching", "expanding"])
    .lt("dispatch_started_at", cutoff);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let swept = 0;
  for (const request of abandoned ?? []) {
    await supabase
      .from("bookings")
      .update({ status: "expired" })
      .eq("care_request_id", request.id)
      .eq("status", "pending");
    const { error: updateErr } = await supabase
      .from("care_requests")
      .update({ dispatch_status: "exhausted" })
      .eq("id", request.id);
    if (!updateErr) swept += 1;
  }

  return NextResponse.json({ checked: abandoned?.length ?? 0, swept });
}
