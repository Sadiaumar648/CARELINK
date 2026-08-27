// staff_profiles.photo_path is a storage path, not a URL — the
// "profile-photos" bucket is public, so this is a plain string build,
// no signed URL or extra request needed.
export function caregiverPhotoUrl(photoPath: string | null | undefined): string | null {
  if (!photoPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/profile-photos/${photoPath}`;
}
