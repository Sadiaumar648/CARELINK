import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// Task 5.x, the retention routine. images_purge_after (doc 5) is set 30
// days past a decision by the sync_verification_status_on_decision
// trigger — this route just acts on it. Vercel Cron invokes this daily
// as a GET with an automatic `Authorization: Bearer $CRON_SECRET`
// header (see vercel.json and
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// The submission row, its decision and verdict stay for audit (PRD F3);
// only the storage files and their paths are removed, per the F7
// data-minimisation principle.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data: due, error } = await supabase
    .from("verification_submissions")
    .select("id, id_document_path, selfie_path")
    .lt("images_purge_after", new Date().toISOString())
    .not("id_document_path", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let purged = 0;
  for (const submission of due ?? []) {
    const paths = [submission.id_document_path, submission.selfie_path].filter((p): p is string =>
      Boolean(p),
    );
    if (paths.length > 0) {
      const { error: removeErr } = await supabase.storage.from("identity-documents").remove(paths);
      if (removeErr) continue; // retried on the next run
    }
    const { error: updateErr } = await supabase
      .from("verification_submissions")
      .update({ id_document_path: null, selfie_path: null })
      .eq("id", submission.id);
    if (!updateErr) purged += 1;
  }

  return NextResponse.json({ checked: due?.length ?? 0, purged });
}
