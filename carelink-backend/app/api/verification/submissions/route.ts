import { NextResponse } from "next/server";
import { z } from "zod";
import { submitVerificationSchema } from "@carelink/shared";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

function extOf(file: File): string {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "bin";
}

// Task 3.2. Serves both roles — the same table and the same route.
// Attempts are kept, never overwritten, so a rejection and its
// resubmission are both on the record (task 3.5 falls out of this for
// free: just POST again).
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent", "staff"]);
    const formData = await request.formData();

    const body = submitVerificationSchema.parse({
      idDocumentType: formData.get("idDocumentType"),
      idDocumentNumber: formData.get("idDocumentNumber"),
      referenceName: formData.get("referenceName"),
      referencePhone: formData.get("referencePhone"),
      referenceRelation: formData.get("referenceRelation") ?? undefined,
      consentPhoto: formData.get("consentPhoto") ?? undefined,
    });

    const idFile = formData.get("idDocumentFile");
    if (!(idFile instanceof File)) {
      return NextResponse.json({ error: "Attach a photo of your ID document" }, { status: 400 });
    }
    const selfieFile = formData.get("selfieFile");

    const idPath = `${userId}/id-${Date.now()}.${extOf(idFile)}`;
    const { error: idUploadErr } = await supabase.storage
      .from("identity-documents")
      .upload(idPath, idFile, { contentType: idFile.type });
    if (idUploadErr) return NextResponse.json({ error: idUploadErr.message }, { status: 400 });

    let selfiePath: string | null = null;
    if (selfieFile instanceof File) {
      selfiePath = `${userId}/selfie-${Date.now()}.${extOf(selfieFile)}`;
      const { error: selfieUploadErr } = await supabase.storage
        .from("identity-documents")
        .upload(selfiePath, selfieFile, { contentType: selfieFile.type });
      if (selfieUploadErr)
        return NextResponse.json({ error: selfieUploadErr.message }, { status: 400 });
    }

    const { data: submission, error: insertErr } = await supabase
      .from("verification_submissions")
      .insert({
        user_id: userId,
        id_document_type: body.idDocumentType,
        id_document_number: body.idDocumentNumber,
        id_document_path: idPath,
        selfie_path: selfiePath,
        reference_name: body.referenceName,
        reference_phone: body.referencePhone,
        reference_relation: body.referenceRelation ?? null,
        consent_photo_at: body.consentPhoto && selfiePath ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });
    return NextResponse.json({ submission }, { status: 201 });
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

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent", "staff"]);
    const { data, error } = await supabase
      .from("verification_submissions")
      .select(
        "id, status, id_document_type, photo_verdict, rejection_reason, reviewed_at, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ submissions: data });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
