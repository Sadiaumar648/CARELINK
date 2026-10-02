import type { SupabaseClient } from "@supabase/supabase-js";
import { calculateTotalAmount, hourlyRateFor, type SkillTag } from "@carelink/shared";
import { findEligibleCaregivers, loadMatchWeights } from "@/lib/services/caregiver-search";
import { generateBookingReference } from "@/lib/bookings";
import { notifyCaregiverAssigned } from "@/lib/services/notify";

// CareLink's auto-assign dispatch engine. Every function here runs using
// the CALLING PARENT's own RLS-scoped Supabase client (never
// service-role) — the same client app/api/bookings/route.ts already
// uses to insert a booking targeting any caregiver.
//
// CareLink no longer asks a caregiver to accept or decline a dispatched
// request: the top-ranked eligible caregiver (already excluding anyone
// on an active booking or with a genuine schedule conflict — see
// findEligibleCaregivers's onDuty/availability filters) is assigned
// directly, as a bookings row inserted straight into 'accepted' with
// terms_locked_at set immediately. That's legal with no migration —
// enforce_booking_transition (20260827110000_bookings.sql) is a
// `before update` trigger only, so it never runs on INSERT. Idempotent
// and safe to call repeatedly: this is what a
// parent's poll of GET /api/care-requests/[id]/dispatch calls, though
// with no human response to wait on, a request now resolves to
// 'accepted' or 'exhausted' on essentially the first call.
//
// A parent who doesn't want the assigned caregiver can swap to a
// specific one themselves via reassignCaregiver ("Browse other
// caregivers") — the one place a particular caregiver is still
// deliberately chosen rather than auto-picked.

export type ActiveOfferSummary = {
  bookingId: string;
  staffProfileId: string;
  caregiverName: string;
  hourlyRate: number;
  status: string;
};

export type DispatchStatusResult = {
  dispatchStatus: string;
  vicinityRound: number;
  activeOffer: ActiveOfferSummary | null;
  // The caregiver currently assigned to this request — resolved from
  // care_requests.preferred_staff_profile_id, which this module now
  // also uses to record the auto-picked (or swapped-in) caregiver, not
  // only a parent's upfront pick. Still populated even once there's no
  // active booking to read a name off (e.g. right after assignment,
  // before the booking summary has loaded).
  assignedCaregiverName: string | null;
};

type CareRequestRow = {
  id: string;
  parent_profile_id: string;
  ward_id: string | null;
  ward_ids: string[] | null;
  caregiver_type: "nanny" | "babysitter";
  date: string;
  start_time: string;
  end_time: string;
  duration_days: number;
  location: string;
  service_address: string | null;
  service_latitude: number | null;
  service_longitude: number | null;
  skills: SkillTag[] | null;
  notes: string | null;
  dispatch_status: string;
  vicinity_round: number;
  preferred_staff_profile_id: string | null;
  preferred_dispatch_done: boolean;
};

type SummarizedBooking = {
  id: string;
  staff_profile_id: string;
  parent_profile_id: string;
  hourly_rate: number;
  status: string;
  terms_locked_at: string | null;
};

async function summarize(
  supabase: SupabaseClient,
  cr: Pick<
    CareRequestRow,
    "id" | "dispatch_status" | "vicinity_round" | "preferred_staff_profile_id"
  >,
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
      status: booking.status,
    };
  }

  let assignedCaregiverName: string | null = activeOffer?.caregiverName ?? null;
  if (!assignedCaregiverName && cr.preferred_staff_profile_id) {
    const { data } = await supabase
      .from("public_caregivers")
      .select("full_name")
      .eq("staff_profile_id", cr.preferred_staff_profile_id)
      .maybeSingle();
    assignedCaregiverName = data?.full_name ?? null;
  }

  return {
    dispatchStatus: cr.dispatch_status,
    vicinityRound: cr.vicinity_round,
    activeOffer,
    assignedCaregiverName,
  };
}

const TERMINAL_STATUSES = new Set(["accepted", "exhausted", "cancelled"]);

type EligibleCandidate = Awaited<ReturnType<typeof findEligibleCaregivers>>["results"][number];

// Shared by the auto-assign path in advanceDispatch and the swap path in
// reassignCaregiver, so the two can never drift on pricing or on what
// "assigned" means (status + terms_locked_at together). Inserts the
// booking straight into 'accepted' — no 'pending' offer, no response
// window — and records the caregiver on care_requests so the UI/
// summarize() always has a name to show.
async function insertAssignedBooking(
  supabase: SupabaseClient,
  careRequest: CareRequestRow,
  candidate: EligibleCandidate,
): Promise<SummarizedBooking> {
  const startsAt = new Date(`${careRequest.date}T${careRequest.start_time.slice(0, 5)}:00Z`);
  const endsAt = new Date(`${careRequest.date}T${careRequest.end_time.slice(0, 5)}:00Z`);
  const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  const wardIds =
    careRequest.ward_ids && careRequest.ward_ids.length > 0
      ? careRequest.ward_ids
      : careRequest.ward_id
        ? [careRequest.ward_id]
        : [];
  const durationDays = careRequest.duration_days || 1;
  const fixedRate = hourlyRateFor(careRequest.caregiver_type);
  const totalAmount = calculateTotalAmount(
    careRequest.caregiver_type,
    durationHours,
    durationDays,
    wardIds.length || 1,
  );
  const now = new Date().toISOString();

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      reference: generateBookingReference(),
      parent_profile_id: careRequest.parent_profile_id,
      staff_profile_id: candidate.staff_profile_id,
      ward_id: wardIds[0] ?? careRequest.ward_id,
      ward_ids: wardIds,
      duration_days: durationDays,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      hourly_rate: fixedRate,
      total_amount: totalAmount,
      // The real, geocoded address goes straight on the booking — there's
      // no "reveal on accept" step anymore, since assignment IS
      // acceptance. Falls back to the coarse area only for an older
      // request that predates service_address ever being resolved.
      address: careRequest.service_address ?? careRequest.location,
      one_off_notes: careRequest.notes,
      match_score: candidate.matchScore,
      match_breakdown: candidate.matchBreakdown,
      care_request_id: careRequest.id,
      status: "accepted",
      terms_locked_at: now,
    })
    .select("id, staff_profile_id, parent_profile_id, hourly_rate, status, terms_locked_at")
    .single();
  if (insertErr) throw insertErr;

  await supabase
    .from("care_requests")
    .update({ preferred_staff_profile_id: candidate.staff_profile_id })
    .eq("id", careRequest.id);

  // CareLink's real email notification system: exactly the caregiver who
  // was actually assigned this request, via the one bookings row just
  // inserted for them. Awaited so it actually runs to completion in a
  // serverless request, but never lets an email failure affect the
  // dispatch result already computed above.
  await notifyCaregiverAssigned({
    id: booking.id,
    staff_profile_id: booking.staff_profile_id,
  }).catch(() => {});

  return booking as SummarizedBooking;
}

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
      .select("id, staff_profile_id, parent_profile_id, hourly_rate, status, terms_locked_at")
      .eq("care_request_id", careRequestId)
      // 'cancelled' included so a booking a reassignCaregiver swap
      // already released is still visible here as the outcome — not
      // dropped, which would leave a "You've been matched!" page
      // polling into silence.
      .in("status", ["accepted", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return summarize(supabase, careRequest, finalBookingRow);
  }

  const weights = await loadMatchWeights(supabase);
  let next: EligibleCandidate | null = null;

  const hasCoordinates =
    careRequest.service_latitude != null && careRequest.service_longitude != null;

  // An optional fast-path: if something upstream ever sets a preferred
  // caregiver (care_requests.preferred_staff_profile_id), try them
  // first, same eligibility bar the old "Recommended Nannies" list used.
  // If they're not eligible, this falls straight through to the normal
  // auto-search below rather than stopping — there's no caregiver
  // response to wait on, so there's nothing to pause for.
  if (careRequest.preferred_staff_profile_id && !careRequest.preferred_dispatch_done) {
    const eligible = await findEligibleCaregivers(
      supabase,
      {
        latitude: hasCoordinates ? careRequest.service_latitude! : undefined,
        longitude: hasCoordinates ? careRequest.service_longitude! : undefined,
        date: careRequest.date,
        startTime: careRequest.start_time.slice(0, 5),
        endTime: careRequest.end_time.slice(0, 5),
        durationDays: careRequest.duration_days,
      },
      weights,
      { availabilityCheck: "conflicts" },
    );
    const preferredMatch = eligible.results.find(
      (r) => r.staff_profile_id === careRequest.preferred_staff_profile_id,
    );
    await supabase
      .from("care_requests")
      .update({ preferred_dispatch_done: true })
      .eq("id", careRequestId);
    if (preferredMatch) next = preferredMatch;
  }

  if (!next) {
    // CareLink's dispatch rule: a caregiver is matched irrespective of
    // where they're based relative to the parent — the only thing that
    // excludes them is already being on an active booking (the onDuty
    // filter below) or a genuine schedule conflict. No area or distance
    // hard filter is passed here, so every accepting, eligible
    // caregiver platform-wide is considered; real coordinates (when the
    // request has them) still feed computeProximityFit purely as a
    // ranking signal, same as area still does for scoring either way —
    // closer still ranks higher when more than one caregiver is
    // eligible, it just never excludes anyone on its own.
    const outcome = await findEligibleCaregivers(
      supabase,
      {
        latitude: hasCoordinates ? careRequest.service_latitude! : undefined,
        longitude: hasCoordinates ? careRequest.service_longitude! : undefined,
        date: careRequest.date,
        startTime: careRequest.start_time.slice(0, 5),
        endTime: careRequest.end_time.slice(0, 5),
        skills: careRequest.skills?.length ? careRequest.skills : undefined,
      },
      weights,
      { caregiverType: careRequest.caregiver_type },
    );
    if (outcome.results.length > 0) next = outcome.results[0];
  }

  if (!next) {
    await supabase
      .from("care_requests")
      .update({ dispatch_status: "exhausted" })
      .eq("id", careRequestId);
    return summarize(supabase, { ...careRequest, dispatch_status: "exhausted" });
  }

  const booking = await insertAssignedBooking(supabase, careRequest, next);

  await supabase
    .from("care_requests")
    .update({ dispatch_status: "accepted" })
    .eq("id", careRequestId);

  return summarize(supabase, { ...careRequest, dispatch_status: "accepted" }, booking);
}

// "Browse other caregivers" — the parent doesn't want the auto-assigned
// (or previously swapped-in) caregiver and picks someone else
// themselves. Legal only while the current booking is still 'accepted'
// and unpaid (once paid, this is a cancellation/rebooking situation, a
// different flow). Re-validates the new caregiver's eligibility for the
// slot, exactly like the initial assignment does, then cancels the old
// booking and assigns the new one in the same call — no waiting, no
// intermediate state, since neither caregiver ever has to respond.
export async function reassignCaregiver(
  supabase: SupabaseClient,
  careRequestId: string,
  staffProfileId: string,
): Promise<DispatchStatusResult> {
  const { data: cr, error } = await supabase
    .from("care_requests")
    .select("*")
    .eq("id", careRequestId)
    .single();
  if (error || !cr) throw error ?? new Error("Care request not found");
  const careRequest = cr as CareRequestRow;

  const { data: currentBooking } = await supabase
    .from("bookings")
    .select("id, staff_profile_id, status")
    .eq("care_request_id", careRequestId)
    .eq("status", "accepted")
    .maybeSingle();
  if (!currentBooking) {
    throw new Error("This request doesn't have an active assignment to change");
  }
  if (currentBooking.staff_profile_id === staffProfileId) {
    const err = new Error("You're already assigned to this caregiver.");
    err.name = "NannyUnavailable";
    throw err;
  }

  const hasCoordinates =
    careRequest.service_latitude != null && careRequest.service_longitude != null;
  const weights = await loadMatchWeights(supabase);
  const eligible = await findEligibleCaregivers(
    supabase,
    {
      latitude: hasCoordinates ? careRequest.service_latitude! : undefined,
      longitude: hasCoordinates ? careRequest.service_longitude! : undefined,
      date: careRequest.date,
      startTime: careRequest.start_time.slice(0, 5),
      endTime: careRequest.end_time.slice(0, 5),
      durationDays: careRequest.duration_days,
    },
    weights,
    { availabilityCheck: "conflicts" },
  );
  const candidate = eligible.results.find((r) => r.staff_profile_id === staffProfileId);
  if (!candidate) {
    const err = new Error(
      "This caregiver is no longer available for your selected time. Please choose another.",
    );
    err.name = "NannyUnavailable";
    throw err;
  }

  // Conditional on still being 'accepted' — race-safe against a
  // concurrent payment: whichever UPDATE's WHERE clause matches the row
  // first wins.
  const { error: cancelErr } = await supabase
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", currentBooking.id)
    .eq("status", "accepted");
  if (cancelErr) throw cancelErr;

  const booking = await insertAssignedBooking(supabase, careRequest, candidate);

  return summarize(supabase, { ...careRequest, dispatch_status: "accepted" }, booking);
}

export async function cancelDispatch(
  supabase: SupabaseClient,
  careRequestId: string,
): Promise<void> {
  // Never cancels a request that's already been assigned a caregiver —
  // once matched, cancelling goes through the booking-level cancel route
  // instead (app/api/bookings/[id]/cancel).
  await supabase
    .from("care_requests")
    .update({ dispatch_status: "cancelled" })
    .eq("id", careRequestId)
    .neq("dispatch_status", "accepted");
}
