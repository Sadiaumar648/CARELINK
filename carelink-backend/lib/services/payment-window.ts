import type { SupabaseClient } from "@supabase/supabase-js";
import { PAYMENT_WINDOW_SECONDS } from "@/lib/dispatch-config";
import { notifyParentPaymentReminder, notifyPaymentWindowExpired } from "@/lib/services/notify";

// CareLink's real phone/SMS notification system: how long before the
// deadline a one-time reminder SMS goes out to the parent. Deliberately
// short relative to the 10-minute window itself — long enough to still
// be actionable, short enough that it never fires immediately after
// acceptance (that's what the separate "caregiver accepted" SMS is
// for).
const PAYMENT_REMINDER_THRESHOLD_SECONDS = 3 * 60;

// CareLink's finalized payment workflow, Part 4: once a caregiver
// accepts, the parent has PAYMENT_WINDOW_SECONDS to pay — enforced here,
// server-side, every time a route touches the booking; a frontend
// countdown (built from paymentDeadline below) is cosmetic only.
//
// A cancelled-by-expiry booking is never distinguishable from an
// ordinary parent-cancelled one by status alone (both land on
// 'cancelled', the only other status this app ever moves a booking to
// — see app/api/bookings/[id]/cancel/route.ts). The real distinguishing
// signal is `cancelled_by`: the manual-cancel route always sets it to
// the acting user's id; this module never does, leaving it null — a
// clean, structural "nobody cancelled this, the clock did" marker, not
// a fragile string match on cancel_reason (which a parent's own typed
// reason could otherwise coincidentally collide with).
export const PAYMENT_EXPIRED_CANCEL_REASON =
  "Payment window expired — this booking was automatically released.";

/** The real deadline a booking's payment window closes at. */
export function paymentDeadline(termsLockedAt: string): Date {
  return new Date(new Date(termsLockedAt).getTime() + PAYMENT_WINDOW_SECONDS * 1000);
}

type ExpirableBooking = {
  id: string;
  status: string;
  terms_locked_at: string | null;
  // Additive: needed so the SMS notifications below can resolve both
  // parties without a second query. Every real caller already selects
  // these columns (either via `.select("*")`, or — dispatch.ts — an
  // explicit column list widened for this exact purpose).
  parent_profile_id: string;
  staff_profile_id: string;
};

/**
 * Lazily, race-safely expires an unpaid 'accepted' booking once its
 * payment window has passed — the same lazy-eval-on-poll pattern
 * lib/services/dispatch.ts already uses for a caregiver's own response
 * window, rather than a cron job. Called from every route that reads or
 * acts on a booking (GET /api/bookings/[id], the dispatch status poll,
 * and the payments route itself), so the expiry is real no matter which
 * screen the parent is looking at, not just the one with a visible
 * countdown.
 *
 * Never fires while a payment attempt is already in flight or has
 * succeeded for this booking — a payment that's genuinely landing can
 * never be clobbered by the timer. Race-safe against a concurrent
 * payment success via the conditional `.eq("status", "accepted")` WHERE
 * clause: whichever of {this expiry, a payment's own "mark paid" update}
 * actually commits first for this row is authoritative, since Postgres
 * serializes concurrent updates to the same row — the loser's WHERE
 * clause simply matches nothing.
 */
export async function expirePaymentWindowIfPassed<T extends ExpirableBooking>(
  supabase: SupabaseClient,
  booking: T,
): Promise<T> {
  if (booking.status !== "accepted" || !booking.terms_locked_at) return booking;

  const deadline = paymentDeadline(booking.terms_locked_at);
  const now = new Date();

  if (now <= deadline) {
    // CareLink's real email notification system: a one-time reminder
    // once the window is genuinely closing, not from the moment it
    // opens. Safe to call on every poll inside this threshold —
    // notifyParentPaymentReminder's own idempotency guard
    // (email_notifications' unique (booking_id, event_type) index)
    // means it only ever actually sends once per booking.
    if (deadline.getTime() - now.getTime() <= PAYMENT_REMINDER_THRESHOLD_SECONDS * 1000) {
      await notifyParentPaymentReminder(booking).catch(() => {});
    }
    return booking;
  }

  const { data: inFlightPayment } = await supabase
    .from("payments")
    .select("id")
    .eq("booking_id", booking.id)
    .in("status", ["initiated", "pending", "succeeded"])
    .maybeSingle();
  // A real payment attempt is already in progress or done for this
  // booking — never cancel out from under it, even if the window has
  // technically closed.
  if (inFlightPayment) return booking;

  const { data: updated } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancel_reason: PAYMENT_EXPIRED_CANCEL_REASON })
    .eq("id", booking.id)
    .eq("status", "accepted")
    .select()
    .single();

  if (updated) {
    // CareLink's real phone/SMS notification system: fires exactly once,
    // right after the booking was genuinely (not simulated) cancelled by
    // the window closing — both the parent (window expired, released)
    // and the caregiver (available for new requests again) are told.
    await notifyPaymentWindowExpired({
      id: booking.id,
      parent_profile_id: booking.parent_profile_id,
      staff_profile_id: booking.staff_profile_id,
    }).catch(() => {});
  }

  return (updated as T | null) ?? booking;
}

/** True only for a booking this module itself expired — never a parent/staff-initiated cancel. */
export function isPaymentExpired(booking: {
  status: string;
  cancelled_by: string | null;
}): boolean {
  return booking.status === "cancelled" && booking.cancelled_by === null;
}
