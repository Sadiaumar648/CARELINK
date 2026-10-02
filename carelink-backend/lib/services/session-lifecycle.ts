import type { SupabaseClient } from "@supabase/supabase-js";

// CareLink's caregivers no longer tap "Start Session" — a booking is
// meant to begin the moment its scheduled starts_at time arrives, the
// time the parent chose when requesting care. There's no fine-grained
// cron for this (the existing Vercel crons only run once daily), so
// instead of a background job, any 'paid' booking whose start time has
// passed is advanced to 'active' right here, as a side effect of being
// read — called from the GET routes a caregiver or parent's own polling
// already hits every few seconds while a session is imminent. Starting
// is still only legal for a 'paid' booking (enforce_booking_transition,
// 20260827110000_bookings.sql), so this can never fire early or twice.
// session_started_at is set to the booking's own starts_at, not the
// moment this function happens to run, so it reflects when the session
// was scheduled to start rather than whenever a poll next landed.
//
// Runs on the caller's own RLS-scoped client — bookings_update_parties
// already restricts the update to bookings that caller is a party to
// (or admin, who's a party to all of them), so this never touches a
// booking the caller couldn't otherwise see or modify.
export async function advanceDueSessions(
  supabase: SupabaseClient,
  bookingId?: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  let query = supabase
    .from("bookings")
    .select("id, starts_at")
    .eq("status", "paid")
    .lte("starts_at", nowIso);
  if (bookingId) query = query.eq("id", bookingId);

  const { data: due } = await query;
  if (!due || due.length === 0) return;

  await Promise.all(
    due.map((b) =>
      supabase
        .from("bookings")
        .update({ status: "active", session_started_at: b.starts_at })
        .eq("id", b.id)
        .eq("status", "paid"),
    ),
  );
}
