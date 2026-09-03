import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateTotalAmount, hourlyRateFor, type SkillTag } from "@carelink/shared";
import { findEligibleCaregivers, loadMatchWeights } from "@/lib/services/caregiver-search";
import { generateBookingReference } from "@/lib/bookings";
import { DISPATCH_VICINITY_RADII_KM, MAX_VICINITY_ROUND } from "@/lib/dispatch-config";
import {
  expirePaymentWindowIfPassed,
  isPaymentExpired,
  paymentDeadline as computePaymentDeadline,
} from "@/lib/services/payment-window";

// The sequential dispatch engine. Every function here runs using the
// CALLING PARENT's own RLS-scoped Supabase client (never service-role) —
// the same client app/api/bookings/route.ts already uses to insert a
// booking targeting any caregiver, and the same one that already lets a
// party to a booking update its status. RLS is the real authority
// throughout; nothing here bypasses it.
//
// Every "offer" is a real bookings row (status 'pending') — this reuses
// the existing accept/decline routes, the existing bookings_no_overlap
// exclusion constraint, and the existing notify_on_booking_created
// trigger untouched. Idempotent and safe to call repeatedly: this is
// what a parent's poll of GET /api/care-requests/[id]/dispatch calls on
// every tick, which is the entire timeout/advance mechanism — no cron
// needed for the live path (see lib/dispatch-config.ts).

export type ActiveOfferSummary = {
  bookingId: string;
  staffProfileId: string;
  caregiverName: string;
  hourlyRate: number;
  expiresAt: string | null;
  status: string;
  // CareLink's finalized payment workflow, Part 4: the real deadline
  // this offer's 10-minute payment window closes at — null once there's
  // nothing left to count down to (not yet accepted, or already
  // resolved). A frontend countdown is built from this real timestamp,
  // never a duration it invents itself.
  paymentDeadline: string | null;
  // True only when this offer's booking was cancelled by the payment
  // window's own lazy sweep — never a parent/staff-initiated cancel —
  // so the UI can show "Payment window expired" instead of a generic
  // cancellation message.
  paymentExpired: boolean;
};

export type DispatchStatusResult = {
  dispatchStatus: string;
  vicinityRound: number;
  activeOffer: ActiveOfferSummary | null;
};

type CareRequestRow = {
  id: string;
  parent_profile_id: string;
  ward_id: string | null;
  caregiver_type: "nanny" | "babysitter";
  date: string;
  start_time: string;
  end_time: string;
  location: string;
  service_latitude: number | null;
  service_longitude: number | null;
  skills: SkillTag[] | null;
  notes: string | null;
  dispatch_status: string;
  vicinity_round: number;
  response_window_seconds: number;
};

type SummarizedBooking = {
  id: string;
  staff_profile_id: string;
  hourly_rate: number;
  offer_expires_at: string | null;
  status: string;
  terms_locked_at: string | null;
  cancelled_by: string | null;
};

async function summarize(
  supabase: SupabaseClient,
  cr: Pick<CareRequestRow, "dispatch_status" | "vicinity_round">,
  booking?: SummarizedBooking | null,
): Promise<DispatchStatusResult> {
  let activeOffer: ActiveOfferSummary | null = null;
  if (booking) {
    const { data: caregiver } = await supabase
      .from("public_caregivers")
      .select("full_name")
      .eq("staff_profile_id", booking.staff_profile_id)
      .maybeSingle();
    activeOffer = {
      bookingId: booking.id,
      staffProfileId: booking.staff_profile_id,
      caregiverName: caregiver?.full_name ?? "A caregiver",
      hourlyRate: booking.hourly_rate,
      expiresAt: booking.offer_expires_at,
      status: booking.status,
      paymentDeadline:
        booking.status === "accepted" && booking.terms_locked_at
          ? computePaymentDeadline(booking.terms_locked_at).toISOString()
          : null,
      paymentExpired: isPaymentExpired(booking),
    };
  }
  return { dispatchStatus: cr.dispatch_status, vicinityRound: cr.vicinity_round, activeOffer };
}

const TERMINAL_STATUSES = new Set(["accepted", "exhausted", "cancelled"]);

export async function advanceDispatch(
  supabase: SupabaseClient,
  careRequestId: string,
): Promise<DispatchStatusResult> {
  const { data: cr, error: crErr } = await supabase
    .from("care_requests")
    .select("*")
    .eq("id", careRequestId)
    .single();
  if (crErr || !cr) throw crErr ?? new Error("Care request not found");
  const careRequest = cr as CareRequestRow;

  if (TERMINAL_STATUSES.has(careRequest.dispatch_status)) {
    const { data: finalBookingRow } = await supabase
      .from("bookings")
      .select(
        "id, staff_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
      )
      .eq("care_request_id", careRequestId)
      // 'cancelled' included so a booking the payment window's own
      // lazy sweep already released is still visible here as the offer
      // outcome — not dropped, which would leave a "Caregiver found!"
      // page polling into silence once its booking expired.
      .in("status", ["pending", "accepted", "cancelled"])
      .maybeSingle();
    // The dispatch status page is the screen most likely to be
    // actively polled while a parent is looking at a live countdown —
    // this is the primary enforcement point in practice, not just a
    // backstop.
    const finalBooking = finalBookingRow
      ? await expirePaymentWindowIfPassed(supabase, finalBookingRow)
      : null;
    return summarize(supabase, careRequest, finalBooking);
  }

  // The current active offer, if any.
  const { data: activeBooking } = await supabase
    .from("bookings")
    .select(
      "id, staff_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
    )
    .eq("care_request_id", careRequestId)
    .eq("status", "pending")
    .maybeSingle();

  if (activeBooking) {
    const expired = activeBooking.offer_expires_at
      ? new Date(activeBooking.offer_expires_at) <= new Date()
      : false;
    if (!expired) {
      // Still within the response window — nothing to advance yet.
      return summarize(supabase, careRequest, activeBooking);
    }
    // Expire it. Conditional on still being 'pending' — race-safe
    // against a concurrent accept: whichever UPDATE's WHERE clause
    // matches the row first wins; the other affects zero rows.
    await supabase
      .from("bookings")
      .update({ status: "expired" })
      .eq("id", activeBooking.id)
      .eq("status", "pending");
  }

  // Everyone already offered this request, in any round, any status —
  // never offered twice in the same search cycle.
  const { data: priorOffers } = await supabase
    .from("bookings")
    .select("staff_profile_id")
    .eq("care_request_id", careRequestId);
  const excludeStaffProfileIds = (priorOffers ?? []).map((b) => b.staff_profile_id as string);

  const weights = await loadMatchWeights(supabase);
  let round = careRequest.vicinity_round;
  let next: Awaited<ReturnType<typeof findEligibleCaregivers>>["results"][number] | null = null;

  // CareLink location system, Part 7/8: a request with resolved
  // coordinates gets a genuine distance-ring expansion instead of the
  // original area-string round — see dispatch-config.ts for why both
  // paths still exist and are capped at the same two rounds.
  const hasCoordinates =
    careRequest.service_latitude != null && careRequest.service_longitude != null;

  while (round <= MAX_VICINITY_ROUND) {
    const outcome = await findEligibleCaregivers(
      supabase,
      {
        // Round 0 = the requested area, exact match; round 1 drops the
        // area filter entirely. Only used when the request has no
        // resolved coordinates — see maxDistanceKm below otherwise.
        area: !hasCoordinates && round === 0 ? careRequest.location : undefined,
        latitude: hasCoordinates ? careRequest.service_latitude! : undefined,
        longitude: hasCoordinates ? careRequest.service_longitude! : undefined,
        date: careRequest.date,
        startTime: careRequest.start_time.slice(0, 5),
        endTime: careRequest.end_time.slice(0, 5),
        skills: careRequest.skills?.length ? careRequest.skills : undefined,
      },
      weights,
      {
        caregiverType: careRequest.caregiver_type,
        excludeStaffProfileIds,
        maxDistanceKm: hasCoordinates ? DISPATCH_VICINITY_RADII_KM[round] : undefined,
      },
    );
    if (outcome.results.length > 0) {
      next = outcome.results[0];
      break;
    }
    round += 1;
  }

  if (round !== careRequest.vicinity_round) {
    await supabase
      .from("care_requests")
      .update({ vicinity_round: Math.min(round, MAX_VICINITY_ROUND) })
      .eq("id", careRequestId);
  }

  if (!next) {
    await supabase
      .from("care_requests")
      .update({ dispatch_status: "exhausted" })
      .eq("id", careRequestId);
    return summarize(supabase, { dispatch_status: "exhausted", vicinity_round: round });
  }

  const startsAt = new Date(`${careRequest.date}T${careRequest.start_time.slice(0, 5)}:00Z`);
  const endsAt = new Date(`${careRequest.date}T${careRequest.end_time.slice(0, 5)}:00Z`);
  const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  // CareLink's finalized fixed-rate model: every real booking is exactly
  // one session, priced from the care request's caregiver_type — never
  // from the offered caregiver's own staff_profiles.hourly_rate (which
  // no longer prices any new booking). sessionCount defaults to 1.
  const fixedRate = hourlyRateFor(careRequest.caregiver_type);
  const totalAmount = calculateTotalAmount(careRequest.caregiver_type, durationHours);
  const expiresAt = new Date(Date.now() + careRequest.response_window_seconds * 1000);

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      reference: generateBookingReference(),
      parent_profile_id: careRequest.parent_profile_id,
      staff_profile_id: next.staff_profile_id,
      ward_id: careRequest.ward_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      hourly_rate: fixedRate,
      total_amount: totalAmount,
      // The general area only, at offer stage — never the parent's
      // exact address before a caregiver has accepted, consistent with
      // the existing "exact address stays private until confirmed"
      // principle already stated on /parent/safety.
      address: careRequest.location,
      one_off_notes: careRequest.notes,
      match_score: next.matchScore,
      match_breakdown: next.matchBreakdown,
      care_request_id: careRequestId,
      offer_expires_at: expiresAt.toISOString(),
    })
    .select(
      "id, staff_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
    )
    .single();
  if (insertErr) throw insertErr;

  const dispatchStatus = round === 0 ? "searching" : "expanding";
  await supabase
    .from("care_requests")
    .update({ dispatch_status: dispatchStatus })
    .eq("id", careRequestId);

  return summarize(supabase, { dispatch_status: dispatchStatus, vicinity_round: round }, booking);
}

export async function cancelDispatch(
  supabase: SupabaseClient,
  careRequestId: string,
): Promise<void> {
  await supabase
    .from("bookings")
    .update({ status: "expired" })
    .eq("care_request_id", careRequestId)
    .eq("status", "pending");
  // Never cancels a request that's already been accepted by a caregiver.
  await supabase
    .from("care_requests")
    .update({ dispatch_status: "cancelled" })
    .eq("id", careRequestId)
    .neq("dispatch_status", "accepted");
}
