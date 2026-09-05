import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/db/supabase-server";
import { getEmailProvider } from "@/lib/services/email-provider";

// CareLink's real email notification system (backend + integration
// task). Every exported function here is best-effort and non-throwing:
// a failure anywhere in this module — no email on file, the email
// provider being down — is caught, logged into email_notifications,
// and returned quietly. Every call site awaits this only AFTER its own
// real database write has already succeeded, and this module never
// lets a failure propagate back to break that write. Sending an email
// must not break the underlying CareLink transaction.
//
// Idempotency: email_notifications has a unique index on
// (booking_id, event_type) where booking_id is not null. sendEmail
// always inserts its row FIRST, before calling the provider — a second
// attempt at the exact same (booking, event) collides with that unique
// index and is silently skipped. This is what makes every notification
// below safe under frontend polling, dispatch advancing repeatedly, and
// a retried request, with no extra locking needed.
//
// Recipient addresses come from the one real source of truth —
// public.users.email, the account's own registered address, resolved
// here via a service-role client, mirroring the exact same narrow
// escalation the accept route already uses (a caregiver's or parent's
// own RLS-scoped client has no select policy on the OTHER party's users
// row). Nothing in this module returns an email address to any client
// response.
//
// A caregiver invited through the admin roster flow (rather than
// self-registering) starts with a placeholder address under
// @carelink.invite (lib/invitations.ts) — a fake internal identifier
// they never see, chosen specifically so onboarding never depended on
// a real inbox. Sending to one of those is indistinguishable here from
// any other address (Resend will simply never deliver it) — the
// account genuinely won't receive real email until it sets its own
// address, same as it wouldn't have received a real SMS before.

const BRAND_SIGNOFF = "— The CareLink Team";

type SendEmailInput = {
  userId: string;
  bookingId: string;
  eventType: string;
  email: string | null;
  subject: string;
  body: string;
};

async function sendEmail(admin: SupabaseClient, input: SendEmailInput): Promise<void> {
  const { data: row, error: insertErr } = await admin
    .from("email_notifications")
    .insert({
      user_id: input.userId,
      booking_id: input.bookingId,
      event_type: input.eventType,
      email: input.email ?? "",
      subject: input.subject,
      message: input.body,
      status: input.email ? "pending" : "failed",
      error: input.email ? null : "No email address on file",
    })
    .select("id")
    .single();

  if (insertErr || !row) {
    // 23505 = unique_violation on (booking_id, event_type) — an email
    // for this exact booking/event was already attempted. That's the
    // idempotency guard working as intended, not an error.
    if (insertErr && insertErr.code !== "23505") {
      console.error("email_notifications insert failed:", insertErr.message);
    }
    return;
  }
  if (!input.email) return; // already logged as failed above; nothing to send

  try {
    const result = await getEmailProvider().send(input.email, input.subject, input.body);
    await admin
      .from("email_notifications")
      .update(
        result.status === "sent"
          ? {
              status: "sent",
              provider_message_id: result.providerMessageId,
              sent_at: new Date().toISOString(),
            }
          : { status: "failed", error: result.error },
      )
      .eq("id", row.id);
  } catch (err) {
    await admin
      .from("email_notifications")
      .update({ status: "failed", error: err instanceof Error ? err.message : "Unknown error" })
      .eq("id", row.id);
  }
}

async function emailForUser(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await admin.from("users").select("email").eq("id", userId).maybeSingle();
  return data?.email || null;
}

async function staffUserId(admin: SupabaseClient, staffProfileId: string): Promise<string | null> {
  const { data } = await admin
    .from("staff_profiles")
    .select("user_id")
    .eq("id", staffProfileId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function parentUserId(
  admin: SupabaseClient,
  parentProfileId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("parent_profiles")
    .select("user_id")
    .eq("id", parentProfileId)
    .maybeSingle();
  return data?.user_id ?? null;
}

// ── Caregiver: a new care request was actually offered to them ─────────
// Called once, right after the one bookings row representing this offer
// is inserted — from lib/services/dispatch.ts (sequential dispatch,
// exactly the caregiver currently receiving the offer, never anyone
// else in the round) and from app/api/bookings/route.ts (a direct,
// non-dispatch booking request). Never sent to an unavailable,
// ineligible, or already-offered caregiver, because a booking row for
// this offer simply doesn't exist for anyone else.
export async function notifyCaregiverNewOffer(booking: {
  id: string;
  staff_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await staffUserId(admin, booking.staff_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "offer_created",
    email: await emailForUser(admin, userId),
    subject: "New care request on CareLink",
    body: `Hello,\n\nYou have a new care request waiting on CareLink. Please open the app to review the details and respond.\n\n${BRAND_SIGNOFF}`,
  });
}

// ── Parent: a caregiver accepted their request ──────────────────────────
// Directs the parent back to CareLink to pay — never claims the booking
// is confirmed/paid, since it isn't yet.
export async function notifyParentCaregiverAccepted(booking: {
  id: string;
  parent_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await parentUserId(admin, booking.parent_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "caregiver_accepted",
    email: await emailForUser(admin, userId),
    subject: "Your caregiver accepted your request",
    body: `Hello,\n\nGreat news — your caregiver has accepted your care request. Please open CareLink to complete payment and confirm your booking.\n\n${BRAND_SIGNOFF}`,
  });
}

// ── Parent: a caregiver declined a DIRECT (non-dispatch) request ───────
// Deliberately scoped to direct bookings only. A decline during
// sequential dispatch is absorbed automatically by the next dispatch
// round (the parent is already watching a live, polled search screen
// for that) — emailing on every single decline in that sequence would
// be exactly the "notification for every minor UI event" this feature
// is meant to avoid. A direct booking has no such automatic next step,
// so the parent genuinely needs to know.
export async function notifyParentDirectBookingDeclined(booking: {
  id: string;
  parent_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await parentUserId(admin, booking.parent_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "booking_declined",
    email: await emailForUser(admin, userId),
    subject: "Update on your care request",
    body: `Hello,\n\nThe caregiver you requested wasn't able to accept this booking. Please open CareLink to choose another caregiver.\n\n${BRAND_SIGNOFF}`,
  });
}

// ── Parent: the 10-minute payment window is closing soon ───────────────
// Called from lib/services/payment-window.ts's expirePaymentWindowIfPassed
// on every poll while the booking is 'accepted' and still within the
// window — safe to call repeatedly; sendEmail's own idempotency guard
// means it only actually sends once per booking.
export async function notifyParentPaymentReminder(booking: {
  id: string;
  parent_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await parentUserId(admin, booking.parent_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "payment_reminder",
    email: await emailForUser(admin, userId),
    subject: "Complete your CareLink payment",
    body: `Hello,\n\nYour payment window is closing soon. Please open CareLink to complete payment and keep your booking.\n\n${BRAND_SIGNOFF}`,
  });
}

// ── Both sides: the payment window actually closed and the booking was
// released ──────────────────────────────────────────────────────────────
// Called from the same expirePaymentWindowIfPassed, exactly once, right
// after it genuinely cancels the booking (never before — this is a real
// state transition, not a simulated one).
export async function notifyPaymentWindowExpired(booking: {
  id: string;
  parent_profile_id: string;
  staff_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();

  const parentId = await parentUserId(admin, booking.parent_profile_id);
  if (parentId) {
    await sendEmail(admin, {
      userId: parentId,
      bookingId: booking.id,
      eventType: "payment_window_expired",
      email: await emailForUser(admin, parentId),
      subject: "Your booking was released",
      body: `Hello,\n\nYour payment window expired, so this booking was automatically released. Please open CareLink if you'd like to request care again.\n\n${BRAND_SIGNOFF}`,
    });
  }

  const staffId = await staffUserId(admin, booking.staff_profile_id);
  if (staffId) {
    await sendEmail(admin, {
      userId: staffId,
      bookingId: booking.id,
      eventType: "booking_released",
      email: await emailForUser(admin, staffId),
      subject: "You're available for new requests",
      body: `Hello,\n\nA request you accepted was released because payment wasn't completed in time. You're available to receive new care requests.\n\n${BRAND_SIGNOFF}`,
    });
  }
}

// ── Prepared for the future Paystack integration — NOT called from
// anywhere yet ──────────────────────────────────────────────────────────
// Today's only "payment succeeded" path (app/api/bookings/[id]/payments/
// route.ts) runs entirely on FakePaymentProvider
// (lib/services/payment-provider.ts) — a deterministic simulation for
// testing, not a real payment verification. Sending a real email there
// today would claim a real payment succeeded when none actually did.
// Once a real Paystack integration verifies a genuine payment (a
// webhook, most likely), call these two functions from that verified
// path — the moment bookings.status is genuinely, verifiably set to
// 'paid'.
export async function notifyParentBookingPaid(booking: {
  id: string;
  parent_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await parentUserId(admin, booking.parent_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "booking_paid_parent",
    email: await emailForUser(admin, userId),
    subject: "Your CareLink booking is confirmed",
    body: `Hello,\n\nYour booking is confirmed. Open CareLink to view your booking details.\n\n${BRAND_SIGNOFF}`,
  });
}

export async function notifyCaregiverBookingConfirmed(booking: {
  id: string;
  staff_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await staffUserId(admin, booking.staff_profile_id);
  if (!userId) return;
  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "booking_paid_staff",
    email: await emailForUser(admin, userId),
    subject: "Your CareLink booking is confirmed",
    body: `Hello,\n\nYour booking is confirmed. Open CareLink to view your booking details.\n\n${BRAND_SIGNOFF}`,
  });
}
