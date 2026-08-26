import type { SupabaseClient } from "@supabase/supabase-js";

// Looked up on nearly every staff-scoped route: staff_profiles doesn't
// exist for a caregiver until their first profile save (task 2.1), since
// task 1.8 only creates the users row.
export async function getOwnStaffProfileId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("staff_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}
