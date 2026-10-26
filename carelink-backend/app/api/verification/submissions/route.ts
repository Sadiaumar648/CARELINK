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

    // Read bytes once and reuse the buffer for both the storage upload
    // and the AI check — re-reading a File's stream a second time is not
    // guaranteed safe across every runtime, and this sidesteps the
    // question entirely.
    const idBuffer = Buffer.from(await idFile.arrayBuffer());
    const selfieBuffer =
      selfieFile instanceof File ? Buffer.from(await selfieFile.arrayBuffer()) : null;

    const idPath = `${userId}/id-${Date.now()}.${extOf(idFile)}`;
    const { error: idUploadErr } = await supabase.storage
      .from("identity-documents")
      .upload(idPath, idBuffer, { contentType: idFile.type });
    if (idUploadErr) return NextResponse.json({ error: idUploadErr.message }, { status: 400 });

    let selfiePath: string | null = null;
    if (selfieFile instanceof File && selfieBuffer) {
      selfiePath = `${userId}/selfie-${Date.now()}.${extOf(selfieFile)}`;
      const { error: selfieUploadErr } = await supabase.storage
        .from("identity-documents")
        .upload(selfiePath, selfieBuffer, { contentType: selfieFile.type });
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

const SELFIE_SIGNED_URL_TTL_SECONDS = 300;

export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["parent", "staff"]);
    const { data, error } = await supabase
      .from("verification_submissions")
      .select(
        "id, status, id_document_type, photo_verdict, rejection_reason, reviewed_at, created_at, selfie_path",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // The live selfie captured for identity verification doubles as the
    // caller's profile photo — their own most recent one, as a
    // short-lived signed URL (the bucket is private; never a public
    // link). Once the retention job purges the underlying image (30
    // days after a decision — see /api/internal/retention), selfie_path
    // goes back to null and this naturally stops resolving to a photo,
    // exactly matching that existing, deliberate retention policy
    // rather than working around it.
    const latestSelfiePath = data.find((s) => s.selfie_path)?.selfie_path ?? null;
    const photoUrl = latestSelfiePath
      ? ((
          await supabase.storage
            .from("identity-documents")
            .createSignedUrl(latestSelfiePath, SELFIE_SIGNED_URL_TTL_SECONDS)
        ).data?.signedUrl ?? null)
      : null;

    return NextResponse.json({ submissions: data, photoUrl });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
