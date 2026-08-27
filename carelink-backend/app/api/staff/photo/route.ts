import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";
import { getOwnStaffProfileId } from "@/lib/staff";

// doc 5's staff_profiles.photo_path and the public-photos storage bucket
// (migration 0016) existed from early on but nothing ever wrote to
// either — this is that missing route. The bucket is public (a profile
// photo isn't sensitive the way an ID document is), so the stored path
// resolves to a public URL with no signing needed.
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireRole(request, ["staff"]);
    const staffProfileId = await getOwnStaffProfileId(supabase, userId);
    if (!staffProfileId) {
      return NextResponse.json({ error: "Complete your profile first" }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Attach a photo" }, { status: 400 });
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const path = `${userId}/photo-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabase.storage
      .from("profile-photos")
      .upload(path, buffer, { contentType: file.type });
    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });

    const { data: updated, error: updateErr } = await supabase
      .from("staff_profiles")
      .update({ photo_path: path })
      .eq("id", staffProfileId)
      .select("photo_path")
      .single();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

    const {
      data: { publicUrl },
    } = supabase.storage.from("profile-photos").getPublicUrl(updated.photo_path);

    return NextResponse.json(
      { photoPath: updated.photo_path, photoUrl: publicUrl },
      { status: 201 },
    );
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
