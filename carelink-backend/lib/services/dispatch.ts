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
import { notifyCaregiverNewOffer } from "@/lib/services/notify";

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
  // The one nanny the parent picked for this request — resolved from
  // care_requests.preferred_staff_profile_id so the parent-facing
  // "Request sent to <name>" / "<name> isn't available" screens always
  // have the name, even once there's no active offer (preferred_declined).
  preferredCaregiverName: string | null;
  // On preferred_declined: whether the picked nanny actively declined or
  // simply let the response window lapse — drives which message shows.
  preferredOutcome: "declined" | "expired" | null;
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
  response_window_seconds: number;
  preferred_staff_profile_id: string | null;
  preferred_dispatch_done: boolean;
  preferred_continue_authorized: boolean;
};

type SummarizedBooking = {
  id: string;
  staff_profile_id: string;
  // Additive: selected alongside the columns this type already carried
  // so lib/services/payment-window.ts's expiry/reminder notifications
  // (CareLink's real email notification system) can resolve both
  // parties from the same row already being fetched here, with no
  // second query.
  parent_profile_id: string;
  hourly_rate: number;
  offer_expires_at: string | null;
  status: string;
  terms_locked_at: string | null;
  cancelled_by: string | null;
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
      expiresAt: booking.offer_expires_at,
      status: booking.status,
      paymentDeadline:
        booking.status === "accepted" && booking.terms_locked_at
          ? computePaymentDeadline(booking.terms_locked_at).toISOString()
          : null,
      paymentExpired: isPaymentExpired(booking),
    };
  }

  let preferredCaregiverName: string | null = activeOffer?.caregiverName ?? null;
  if (!preferredCaregiverName && cr.preferred_staff_profile_id) {
    const { data } = await supabase
      .from("public_caregivers")
      .select("full_name")
      .eq("staff_profile_id", cr.preferred_staff_profile_id)
      .maybeSingle();
    preferredCaregiverName = data?.full_name ?? null;
  }

  let preferredOutcome: "declined" | "expired" | null = null;
  if (cr.dispatch_status === "preferred_declined") {
    const { data: lastOffer } = await supabase
      .from("bookings")
      .select("status")
      .eq("care_request_id", cr.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // "expired" only when there really was an offer that timed out;
    // a decline, or a nanny who turned out ineligible before any offer
    // was ever made, both read as "isn't available".
    preferredOutcome = lastOffer && lastOffer.status !== "declined" ? "expired" : "declined";
  }

  return {
    dispatchStatus: cr.dispatch_status,
    vicinityRound: cr.vicinity_round,
    activeOffer,
    preferredCaregiverName,
    preferredOutcome,
  };
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
        "id, staff_profile_id, parent_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
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

  // Preferred-caregiver-declined is a PAUSE, not a terminal outcome and
  // not something dispatch auto-advances out of the way every other
  // decline/timeout above does — it stays here, with no active offer,
  // until the parent explicitly calls continuePreferredDispatch below
  // (POST .../dispatch/continue).
  if (careRequest.dispatch_status === "preferred_declined") {
    return summarize(supabase, careRequest, null);
  }

  // The current active offer, if any.
  const { data: activeBooking } = await supabase
    .from("bookings")
    .select(
      "id, staff_profile_id, parent_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
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

  // The one nanny the parent picked. CareLink offers the request only
  // to them — it never falls through to a sequential queue or contacts
  // anyone else. The eligibility check here is exactly the one the
  // "Recommended Nannies" list used to produce them (public_caregivers
  // membership = active + CareLink-verified + accepting; plus a
  // conflicts-only availability check = no clashing booking, no
  // marked-unavailable date — never their declared weekly hours), so a
  // nanny who was recommended for this slot is offered it. If they've
  // become unavailable since, or later decline / don't respond, the
  // request pauses at preferred_declined and the parent picks another
  // nanny themselves (POST .../dispatch/reselect) — never automatic.
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
    if (preferredMatch) {
      next = preferredMatch;
    } else {
      await supabase
        .from("care_requests")
        .update({ dispatch_status: "preferred_declined" })
        .eq("id", careRequestId);
      return summarize(supabase, { ...careRequest, dispatch_status: "preferred_declined" });
    }
  }

  // The preferred caregiver's own offer (created on a previous call)
  // has just been declined or timed out — activeBooking above found
  // nothing pending, and the branch immediately above was skipped
  // because preferred_dispatch_done is already true. This is the one
  // moment that distinguishes "just concluded, pause here" from "the
  // parent already clicked Find another caregiver, proceed normally" —
  // preferred_continue_authorized is what continuePreferredDispatch
  // sets to tell the two apart; without it, both look identical
  // (preferred_dispatch_done = true, no active booking).
  if (
    !next &&
    careRequest.preferred_staff_profile_id &&
    careRequest.preferred_dispatch_done &&
    !careRequest.preferred_continue_authorized
  ) {
    await supabase
      .from("care_requests")
      .update({ dispatch_status: "preferred_declined" })
      .eq("id", careRequestId);
    return summarize(supabase, { ...careRequest, dispatch_status: "preferred_declined" });
  }

  if (!next) {
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
          // CareLink's current dispatch rule (superseding the comment this
          // replaced): an approved, active caregiver is automatically
          // dispatch-eligible — accepting_bookings (default true at
          // profile creation) plus the same hard filters ordinary search
          // already applies (caregiver type, schedule/conflicts, skills,
          // verification via public_caregivers), no separate manual
          // "go available" action required. Distance still prefers a live
          // dispatch fix (staff_dispatch_locations) when the caregiver has
          // location sharing on, falling back to their base/service
          // location (staff_profiles.base_latitude/longitude) otherwise —
          // nearby_caregiver_distances already does this coalesce, so nothing
          // here has to choose between the two. requireDispatchAvailable
          // stays available in caregiver-search.ts but is deliberately not
          // passed anymore.
        },
      );
      if (outcome.results.length > 0) {
        next = outcome.results[0];
        break;
      }
      round += 1;
    }
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
    return summarize(supabase, { ...careRequest, dispatch_status: "exhausted" });
  }

  const startsAt = new Date(`${careRequest.date}T${careRequest.start_time.slice(0, 5)}:00Z`);
  const endsAt = new Date(`${careRequest.date}T${careRequest.end_time.slice(0, 5)}:00Z`);
  const durationHours = (endsAt.getTime() - startsAt.getTime()) / 3_600_000;
  // CareLink's finalized fixed-rate model: priced from the care
  // request's caregiver_type — never the offered caregiver's own
  // staff_profiles.hourly_rate. The booking's starts_at/ends_at are day
  // one's window; duration_days is how many consecutive days it runs,
  // and total_amount is the whole engagement (daily hours × rate × days
  // × children).
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
  const expiresAt = new Date(Date.now() + careRequest.response_window_seconds * 1000);

  const { data: booking, error: insertErr } = await supabase
    .from("bookings")
    .insert({
      reference: generateBookingReference(),
      parent_profile_id: careRequest.parent_profile_id,
      staff_profile_id: next.staff_profile_id,
      ward_id: wardIds[0] ?? careRequest.ward_id,
      ward_ids: wardIds,
      duration_days: durationDays,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      hourly_rate: fixedRate,
      total_amount: totalAmount,
      // CareLink's parent-selected-nanny model: this offer is sent
      // directly to the one nanny the parent already picked, never
      // broadcast — so the real, geocoded address goes on the offer from
      // the start, letting that nanny see exactly where the session is
      // before deciding. Falls back to the coarse area only for an older
      // request that predates service_address ever being resolved.
      address: careRequest.service_address ?? careRequest.location,
      one_off_notes: careRequest.notes,
      match_score: next.matchScore,
      match_breakdown: next.matchBreakdown,
      care_request_id: careRequestId,
      offer_expires_at: expiresAt.toISOString(),
    })
    .select(
      "id, staff_profile_id, parent_profile_id, hourly_rate, offer_expires_at, status, terms_locked_at, cancelled_by",
    )
    .single();
  if (insertErr) throw insertErr;

  // CareLink's real email notification system: exactly the caregiver
  // who was actually offered this request, via the one bookings row
  // just inserted for them — never anyone else in the round, never a
  // caregiver who was skipped as unavailable/ineligible. Awaited so it
  // actually runs to completion in a serverless request, but never lets
  // an email failure affect the dispatch result already computed above.
  await notifyCaregiverNewOffer({
    id: booking.id,
    staff_profile_id: booking.staff_profile_id,
  }).catch(() => {});

  const dispatchStatus = round === 0 ? "searching" : "expanding";
  await supabase
    .from("care_requests")
    .update({ dispatch_status: dispatchStatus })
    .eq("id", careRequestId);

  return summarize(
    supabase,
    { ...careRequest, dispatch_status: dispatchStatus, vicinity_round: round },
    booking,
  );
}

// "Find another caregiver" — the parent's explicit choice to move past
// a preferred caregiver who declined, didn't respond, or wasn't
// eligible. Only legal from the paused preferred_declined state (never
// silently resumes anything else). Clearing it back to not_started lets
// the very next advanceDispatch fall straight into the normal
// sequential queue — preferred_dispatch_done is already true by this
// point, so the preferred-caregiver check above is never re-entered.
export async function continuePreferredDispatch(
  supabase: SupabaseClient,
  careRequestId: string,
): Promise<DispatchStatusResult> {
  const { data: cr, error } = await supabase
    .from("care_requests")
    .select("dispatch_status")
    .eq("id", careRequestId)
    .single();
  if (error || !cr) throw error ?? new Error("Care request not found");
  if (cr.dispatch_status !== "preferred_declined") {
    throw new Error("This request isn't waiting on a preferred-caregiver decision");
  }
  await supabase
    .from("care_requests")
    .update({ dispatch_status: "not_started", preferred_continue_authorized: true })
    .eq("id", careRequestId);
  return advanceDispatch(supabase, careRequestId);
}

// "Choose Another Nanny" — the parent picked a different nanny after
// their first pick declined or didn't respond. This re-targets the SAME
// care request at the new nanny and offers it to them (and only them);
// it never starts a sequential queue. Only legal from preferred_declined
// (the paused state the two "isn't available" / "didn't respond" screens
// show). Re-validates eligibility for the requested slot first, exactly
// like POST /api/care-requests does on the first send — a nanny who
// can't take it is refused here, not offered.
export async function reselectPreferredCaregiver(
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
  if (careRequest.dispatch_status !== "preferred_declined") {
    throw new Error("This request isn't waiting for you to choose another nanny");
  }

  // A caregiver already offered this request who declined or let the
  // window lapse can't be picked again for it — the parent chooses
  // someone new. (The "choose another nanny" list already hides them;
  // this is the server-side guard.)
  const { data: priorOffers } = await supabase
    .from("bookings")
    .select("staff_profile_id")
    .eq("care_request_id", careRequestId)
    .in("status", ["declined", "expired", "cancelled"]);
  if ((priorOffers ?? []).some((b) => b.staff_profile_id === staffProfileId)) {
    const err = new Error(
      "You've already sent this request to that nanny. Please choose a different one.",
    );
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
  if (!eligible.results.some((r) => r.staff_profile_id === staffProfileId)) {
    const err = new Error(
      "This nanny is no longer available for your selected time. Please choose another nanny.",
    );
    err.name = "NannyUnavailable";
    throw err;
  }

  await supabase
    .from("care_requests")
    .update({
      preferred_staff_profile_id: staffProfileId,
      preferred_dispatch_done: false,
      preferred_continue_authorized: false,
      dispatch_status: "not_started",
      vicinity_round: 0,
    })
    .eq("id", careRequestId);

  return advanceDispatch(supabase, careRequestId);
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
