import { NextResponse } from "next/server";
import { z } from "zod";
import { reviewVerificationSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

const SIGNED_URL_TTL_SECONDS = 300;

// Task 3.4 detail: both images as short-lived signed URLs, never a
// public link — the bucket is private (task 3.1).
export async function GET(request: Request, ctx: RouteContext<"/api/admin/verifications/[id]">) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;

    const { data: submission, error } = await supabase
      .from("verification_submissions")
      .select("*, users!verification_submissions_user_id_fkey(full_name, phone, role)")
      .eq("id", id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { data: idUrl } = await supabase.storage
      .from("identity-documents")
      .createSignedUrl(submission.id_document_path, SIGNED_URL_TTL_SECONDS);
    const selfieUrl = submission.selfie_path
      ? (
          await supabase.storage
            .from("identity-documents")
            .createSignedUrl(submission.selfie_path, SIGNED_URL_TTL_SECONDS)
        ).data
      : null;

    return NextResponse.json({
      submission,
      idDocumentUrl: idUrl?.signedUrl ?? null,
      selfieUrl: selfieUrl?.signedUrl ?? null,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}

// Task 3.4 decision. The outcome writes to the record; users.verification_
// status stays in sync automatically via the trigger from migration
// 0016 — this route only ever touches verification_submissions.
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/verifications/[id]">) {
  try {
    const { supabase, userId } = await requireRole(request, ["admin"]);
    const { id } = await ctx.params;
    const body = reviewVerificationSchema.parse(await request.json());

    if (body.decision === "verified") {
      const { data: submission } = await supabase
        .from("verification_submissions")
        .select("user_id")
        .eq("id", id)
        .maybeSingle();
      if (submission) {
        const { data: openReports } = await supabase
          .from("reports")
          .select("id")
          .eq("subject_user_id", submission.user_id)
          .in("status", ["open", "investigating"])
          .limit(1);
        if (openReports && openReports.length > 0) {
          return NextResponse.json(
            { error: "This account has an unresolved report and cannot be verified yet" },
            { status: 400 },
          );
        }
      }
    }

    const { data: updated, error } = await supabase
      .from("verification_submissions")
      .update({
        status: body.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: body.decision === "rejected" ? body.rejectionReason : null,
      })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ submission: updated });
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
