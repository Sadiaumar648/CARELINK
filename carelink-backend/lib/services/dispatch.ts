import type { SupabaseClient } from "@supabase/supabase-js";
import type { SkillTag } from "@carelink/shared";
import { findEligibleCaregivers, loadMatchWeights } from "@/lib/services/caregiver-search";
import { generateBookingReference } from "@/lib/bookings";
import { MAX_VICINITY_ROUND } from "@/lib/dispatch-config";

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
  skills: SkillTag[] | null;
  notes: string | null;
  dispatch_status: string;
  vicinity_round: number;
  response_window_seconds: number;
};

async function summarize(
  supabase: SupabaseClient,
  cr: Pick<CareRequestRow, "dispatch_status" | "vicinity_round">,
  booking?: {
    id: string;
    staff_profile_id: string;
    hourly_rate: number;
    offer_expires_at: string | null;
    status: string;
  } | null,
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
    const { data: finalBooking } = await supabase
      .from("bookings")
      .select("id, staff_profile_id, hourly_rate, offer_expires_at, status")
      .eq("care_request_id", careRequestId)
      .in("status", ["pending", "accepted"])
      .maybeSingle();
    return summarize(supabase, careRequest, finalBooking);
  }

  // The current active offer, if any.
  const { data: activeBooking } = await supabase
    .from("bookings")
    .select("id, staff_profile_id, hourly_rate, offer_expires_at, status")
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

  while (round <= MAX_VICINITY_ROUND) {
    const outcome = await findEligibleCaregivers(
      supabase,
      {
        // Round 0 = the requested area, exact match. Round 1 (the only
        // expansion this app can honestly do — see dispatch-config.ts)
        // drops the area filter entirely rather than guessing at
        // "nearby" neighbourhoods that aren't in the data.
        area: round === 0 ? careRequest.location : undefined,
        date: careRequest.date,
        startTime: careRequest.start_time.slice(0, 5),
        endTime: careRequest.end_time.slice(0, 5),
        skills: careRequest.skills?.length ? careRequest.skills : undefined,
      },
      weights,
      { caregiverType: careRequest.caregiver_type, excludeStaffProfileIds },
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
  const totalAmount = Math.round(next.hourly_rate * durationHours);
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
      hourly_rate: next.hourly_rate,
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
    .select("id, staff_profile_id, hourly_rate, offer_expires_at, status")
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
