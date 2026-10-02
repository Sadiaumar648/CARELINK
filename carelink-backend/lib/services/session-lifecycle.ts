import type { SupabaseClient } from "@supabase/supabase-js";
import { computeCommissionSplit } from "@/lib/services/commission";
import { createServiceRoleClient } from "@/lib/db/supabase-server";

// CareLink's caregivers no longer tap "Start Session" — a booking is
// meant to begin the moment its scheduled starts_at time arrives, the
// time the parent chose when requesting care. Sessions also end on
// their own once their scheduled ends_at time arrives, so both parties
// see a real "session ended" outcome even if the caregiver never taps
// "End session" themselves (that button still exists, for ending a
// session early). There's no fine-grained cron for either (the existing
// Vercel crons only run once daily), so instead of a background job,
// any 'paid' booking whose start time has passed, or 'active' booking
// whose end time has passed, is advanced right here, as a side effect
// of being read — called from the GET routes a caregiver or parent's
// own polling already hits every few seconds while a session is
// imminent or in progress. Both transitions are only ever legal from
// the status this function checks for (enforce_booking_transition,
// 20260827110000_bookings.sql), so neither can fire early or twice.
// The booking's own starts_at/ends_at is used as the recorded
// started/ended time, not the moment this function happens to run, so
// it reflects the schedule rather than whenever a poll next landed.
//
// Runs on the caller's own RLS-scoped client — bookings_update_parties
// (and payments_update_parties, for the commission split below)
// already restrict these to bookings/payments that caller is a party
// to (or admin, who's a party to all of them), so this never touches a
// booking the caller couldn't otherwise see or modify.
export async function advanceDueSessions(
  supabase: SupabaseClient,
  bookingId?: string,
): Promise<void> {
  const nowIso = new Date().toISOString();

  let startQuery = supabase
    .from("bookings")
    .select("id, starts_at")
    .eq("status", "paid")
    .lte("starts_at", nowIso);
  if (bookingId) startQuery = startQuery.eq("id", bookingId);
  const { data: dueToStart } = await startQuery;

  await Promise.all(
    (dueToStart ?? []).map((b) =>
      supabase
        .from("bookings")
        .update({ status: "active", session_started_at: b.starts_at })
        .eq("id", b.id)
        .eq("status", "paid"),
    ),
  );

  let endQuery = supabase
    .from("bookings")
    .select("id, ends_at")
    .eq("status", "active")
    .lte("ends_at", nowIso);
  if (bookingId) endQuery = endQuery.eq("id", bookingId);
  const { data: dueToEnd } = await endQuery;

  await Promise.all((dueToEnd ?? []).map((b) => completeSession(supabase, b.id, b.ends_at)));
}

// The real work of ending a session — shared by the automatic advance
// above and the caregiver's own manual "End session" tap
// (app/api/bookings/[id]/end/route.ts), so the two can never drift:
// closes the booking, stops SafeTrack location sharing, and settles
// the commission split against the booking's succeeded payment.
// `.eq("status", "active")` on the update makes this safely idempotent
// — if two callers race (a poll and a manual tap), only the first
// actually updates anything, and the second's update matches zero rows
// instead of double-settling the payment.
export async function completeSession(
  supabase: SupabaseClient,
  bookingId: string,
  endedAtIso: string,
): Promise<boolean> {
  const { data: updated, error } = await supabase
    .from("bookings")
    .update({ status: "completed", session_ended_at: endedAtIso, completed_at: endedAtIso })
    .eq("id", bookingId)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error || !updated) return false;

  // SafeTrack (caregiver safety spec): stop location sharing the
  // instant the session ends, regardless of which party — or nothing —
  // actually ended it. The caregiver-owned delete policy wouldn't cover
  // this running under a parent's client, so it goes through the
  // service role rather than the caller's own. Best-effort: a booking
  // that never had sharing enabled has no row to delete.
  await createServiceRoleClient().from("caregiver_locations").delete().eq("booking_id", bookingId);

  const { data: settingRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "commission_rate")
    .single();
  const commissionRate = Number(settingRow?.value ?? 0.15);

  const { data: succeededPayment } = await supabase
    .from("payments")
    .select("id, amount")
    .eq("booking_id", bookingId)
    .eq("status", "succeeded")
    .maybeSingle();

  if (succeededPayment) {
    const { commissionAmount, payoutAmount } = computeCommissionSplit(
      succeededPayment.amount,
      commissionRate,
    );
    await supabase
      .from("payments")
      .update({
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        payout_amount: payoutAmount,
        settled_at: endedAtIso,
      })
      .eq("id", succeededPayment.id);
  }

  return true;
}
