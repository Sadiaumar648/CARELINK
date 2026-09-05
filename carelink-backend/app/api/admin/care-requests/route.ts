import { NextResponse } from "next/server";
import { authErrorResponse, requireRole } from "@/lib/auth/require-user";

// Backs the Admin "View Care Requests" page — real care_requests rows,
// joined against their one associated bookings row (if a dispatch
// offer/direct booking exists) to derive the final-workflow status
// label shown there. care_requests.dispatch_status alone only tracks
// the search itself (searching/expanding/accepted/exhausted/cancelled);
// once dispatch produces an offer, the real, current state (awaiting
// payment, paid, in progress, completed, payment-expired) lives on the
// bookings row it created — the same distinction lib/services/
// dispatch.ts's own summarize() already makes for the parent-facing
// dispatch-status poll.
const LIMIT = 50;

type CareRequestRow = {
  id: string;
  caregiver_type: "nanny" | "babysitter";
  dispatch_status: string;
  date: string;
  start_time: string;
  created_at: string;
};

type BookingLookup = {
  care_request_id: string;
  status: string;
  cancelled_by: string | null;
};

function displayStatus(dispatchStatus: string, booking: BookingLookup | undefined): string {
  if (booking) {
    switch (booking.status) {
      case "pending":
        return "Caregiver Offer";
      case "accepted":
        return "Awaiting Payment";
      case "paid":
        return "Confirmed / Paid";
      case "active":
        return "In Progress";
      case "completed":
        return "Completed";
      case "cancelled":
        // The payment window's own lazy expiry never sets cancelled_by
        // (see lib/services/payment-window.ts) — the one reliable signal
        // that this was a released, unpaid booking rather than someone
        // cancelling it directly.
        return booking.cancelled_by === null ? "Payment Expired" : "Cancelled";
      case "expired":
        // One caregiver's own offer expiring mid-search — the search
        // itself is still live (dispatch_status stays searching/
        // expanding while it moves to the next caregiver), so this
        // falls through to the dispatch_status branch below rather
        // than reading as the whole request's outcome.
        break;
    }
  }
  switch (dispatchStatus) {
    case "searching":
    case "expanding":
      return "Searching";
    case "accepted":
      // Terminal on the request, but the real outcome is on the
      // booking above — reaching here means that booking row wasn't
      // found for some reason; fall back to a safe, honest label.
      return "Confirmed / Paid";
    case "exhausted":
    case "cancelled":
      return "Cancelled";
    default:
      return dispatchStatus;
  }
}

export async function GET(request: Request) {
  try {
    const { supabase } = await requireRole(request, ["admin"]);

    const { data: careRequests, error: crErr } = await supabase
      .from("care_requests")
      .select("id, caregiver_type, dispatch_status, date, start_time, created_at")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (crErr) return NextResponse.json({ error: crErr.message }, { status: 500 });

    const ids = (careRequests ?? []).map((cr) => cr.id);
    const { data: bookings, error: bErr } =
      ids.length > 0
        ? await supabase
            .from("bookings")
            .select("care_request_id, status, cancelled_by")
            .in("care_request_id", ids)
        : { data: [] as BookingLookup[], error: null };
    if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });

    const bookingByRequest = new Map((bookings ?? []).map((b) => [b.care_request_id, b]));

    const careRequestList = ((careRequests as CareRequestRow[] | null) ?? []).map((cr) => ({
      id: cr.id,
      caregiverType: cr.caregiver_type,
      status: displayStatus(cr.dispatch_status, bookingByRequest.get(cr.id)),
      date: cr.date,
      startTime: cr.start_time,
      createdAt: cr.created_at,
    }));

    return NextResponse.json({ careRequests: careRequestList });
  } catch (error) {
    return (
      authErrorResponse(error) ?? NextResponse.json({ error: "Unexpected error" }, { status: 500 })
    );
  }
}
