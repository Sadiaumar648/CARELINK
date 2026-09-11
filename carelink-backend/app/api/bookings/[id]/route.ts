import { NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth/require-user";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import {
  expirePaymentWindowIfPassed,
  isPaymentExpired,
  paymentDeadline,
} from "@/lib/services/payment-window";

// A caregiver is a party to a booking (and so passes bookings_read_parties)
// from the moment a parent requests it — RLS has no status condition, by
// design. CareLink's parent-selected-nanny model sends a 'pending' offer
// directly to the one nanny the parent picked (never a broadcast to
// several caregivers at once), so that nanny sees the real address while
// deciding whether to accept — "don't show the exact address" is reserved
// for a request that fell through without ever being accepted
// (declined/expired), enforced here in what the route returns, not in the
// row-level policy. cancelled/disputed are reachable either from pending
// or from accepted, so those two fall back to checking the booking's own
// event log for a real "accepted" transition, rather than guessing from
// the current status alone.
const NEVER_ACCEPTED_STATUSES = new Set(["declined", "expired"]);
function staffCanSeeExactAddress(status: string, events: { to_status: string }[]): boolean {
  if (status === "cancelled" || status === "disputed") {
    return events.some((e) => e.to_status === "accepted");
  }
  return !NEVER_ACCEPTED_STATUSES.has(status);
}

// Task 2.13 (detail), 2.14 (care profile attachment) and 3.8 (symmetric
// emergency-contact reveal). The ward is fetched through the same
// request-scoped client as the booking, so row-level security alone
// decides whether it comes back. The emergency contact is narrower than
// RLS can express in one row-level policy (visible to the counterparty
// only while status is exactly "active", never before or after) — it's
// fetched explicitly here, gated on that one condition, and nowhere else
// in the API surface exposes it.
export async function GET(request: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  try {
    const { supabase, role } = await requireUser(request);
    const { id } = await ctx.params;

    const { data: bookingRow, error: bookingErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });
    if (!bookingRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // CareLink's finalized payment workflow: viewing a booking is itself
    // one of the places the 10-minute payment window is enforced —
    // never just the two obvious touch-points (the dispatch poll, the
    // payment route) — so a parent who lands here after the window
    // closed always sees the real, already-expired state, not a stale
    // 'accepted' row waiting for some other request to notice.
    const booking = await expirePaymentWindowIfPassed(supabase, bookingRow);

    // A booking can cover more than one child (multi-child "Request a
    // Nanny"). `wards` is the full set, primary first; `ward` stays as
    // the primary alone for any caller that still reads a single ward.
    const wardIds: string[] =
      Array.isArray(booking.ward_ids) && booking.ward_ids.length > 0
        ? booking.ward_ids
        : booking.ward_id
          ? [booking.ward_id]
          : [];
    let wards: Record<string, unknown>[] = [];
    if (wardIds.length > 0) {
      const { data: wardData } = await supabase.from("wards").select("*").in("id", wardIds);
      wards = wardIds
        .map((id) => (wardData ?? []).find((w) => w.id === id))
        .filter((w): w is Record<string, unknown> => Boolean(w));
    }
    const ward = wards[0] ?? null;

    const { data: events } = await supabase
      .from("booking_events")
      .select("from_status, to_status, actor_id, note, occurred_at")
      .eq("booking_id", id)
      .order("occurred_at", { ascending: true });

    // The counterparty's emergency contact (gated to exactly "active",
    // symmetric — task 3.8) and their user id, which — unlike the
    // emergency contact — is reasonable to know at any point once a
    // booking exists between the two of you: it's what filing a report
    // against them needs (task 4.9), and not a new disclosure beyond what
    // messaging/reviews already imply.
    let emergencyContact: { name: string; phone: string } | null = null;
    let counterpartyUserId: string | null = null;
    // Whether the counterparty has completed identity verification — the
    // caregiver safety spec's "✓ Verified Parent" needs this, and it's the
    // same "reasonable to know once a booking exists" reasoning as the user
    // id above. users RLS only allows reading your own row, so — like the
    // emergency contact next to it — this is read through the service role,
    // narrowly, only for the one counterparty id this booking already
    // establishes a relationship with.
    let counterpartyVerificationStatus: string | null = null;
    let counterpartyVerificationMethod: string | null = null;
    if (role === "parent" || role === "staff") {
      const admin = createServiceRoleClient();
      const counterpartyTable = role === "parent" ? "staff_profiles" : "parent_profiles";
      const counterpartyId =
        role === "parent" ? booking.staff_profile_id : booking.parent_profile_id;
      const { data } = await admin
        .from(counterpartyTable)
        .select("user_id, emergency_contact_name, emergency_contact_phone")
        .eq("id", counterpartyId)
        .maybeSingle();
      counterpartyUserId = data?.user_id ?? null;
      if (data && booking.status === "active") {
        emergencyContact = {
          name: data.emergency_contact_name,
          phone: data.emergency_contact_phone,
        };
      }
      if (counterpartyUserId) {
        const { data: counterpartyUser } = await admin
          .from("users")
          .select("verification_status, verification_method")
          .eq("id", counterpartyUserId)
          .maybeSingle();
        counterpartyVerificationStatus = counterpartyUser?.verification_status ?? null;
        counterpartyVerificationMethod = counterpartyUser?.verification_method ?? null;
      }
    }

    // Address privacy (caregiver safety spec §1-3): a caregiver who hasn't
    // accepted yet gets the parent's general area only, never the exact
    // address — the parent themselves and an admin always see the real
    // thing.
    let responseBooking = booking;
    let careLocationGeneral: string | null = null;
    if (role === "staff" && !staffCanSeeExactAddress(booking.status, events ?? [])) {
      const { data: parentProfile } = await supabase
        .from("parent_profiles")
        .select("area")
        .eq("id", booking.parent_profile_id)
        .maybeSingle();
      careLocationGeneral = parentProfile?.area ?? null;
      responseBooking = { ...booking, address: null };
    }

    return NextResponse.json({
      booking: responseBooking,
      // The real deadline this booking's payment window closes at —
      // null once there's nothing left to count down to. A frontend
      // countdown is built from this real timestamp, never a duration
      // it invents itself.
      paymentDeadline:
        booking.status === "accepted" && booking.terms_locked_at
          ? paymentDeadline(booking.terms_locked_at).toISOString()
          : null,
      paymentExpired: isPaymentExpired(booking),
      careLocationGeneral,
      ward,
      wards,
      events: events ?? [],
      emergencyContact,
      counterpartyUserId,
      counterpartyVerificationStatus,
      counterpartyVerificationMethod,
    });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
