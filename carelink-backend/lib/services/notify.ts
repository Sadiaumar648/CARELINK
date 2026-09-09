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

// The deployed frontend's own origin — reused rather than a new env var,
// since ALLOWED_ORIGIN (middleware.ts) already holds exactly this
// (comma-separated: the deployed frontend first, local dev appended).
// The hardcoded fallback is the actual known deployed URL, never a
// placeholder/fabricated one, in case the env var is ever unset.
function appUrl(): string {
  const first = (process.env.ALLOWED_ORIGIN ?? "").split(",")[0]?.trim();
  return first || "https://carelink-frontend-six.vercel.app";
}

const CAREGIVER_TYPE_LABEL: Record<string, string> = {
  nanny: "Nanny",
  babysitter: "Babysitter",
};

function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeRange(startsAtIso: string, endsAtIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" });
  return `${fmt(startsAtIso)} – ${fmt(endsAtIso)}`;
}

// A minimal, professional CareLink-branded shell — inline styles only
// (email clients don't load external stylesheets). Used wherever an
// email needs more than the plain-text notifications this module
// already sends; every existing plain-text call site is untouched.
function emailShell(bodyHtml: string, cta?: { label: string; href: string }): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f1b2e;">
  <p style="font-size:18px;font-weight:700;color:#6b4ea0;margin:0 0 20px;">CareLink</p>
  ${bodyHtml}
  ${
    cta
      ? `<p style="margin:24px 0;">
    <a href="${cta.href}" style="display:inline-block;background:#6b4ea0;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;font-size:14px;">${cta.label}</a>
  </p>`
      : ""
  }
  <p style="font-size:13px;color:#6b6478;margin-top:24px;">${BRAND_SIGNOFF}</p>
</div>`;
}

type SendEmailInput = {
  userId: string;
  bookingId: string;
  eventType: string;
  email: string | null;
  subject: string;
  body: string;
  html?: string;
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
    const result = await getEmailProvider().send(
      input.email,
      input.subject,
      input.body,
      input.html,
    );
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
    if (result.status === "failed") {
      // "Log the email failure clearly for debugging" — the row above
      // already records it durably (queryable per booking/event), this
      // is the immediate, greppable server-log signal alongside it.
      console.error(
        `email failed: booking=${input.bookingId} event=${input.eventType} to=${input.email} — ${result.error}`,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await admin
      .from("email_notifications")
      .update({ status: "failed", error: message })
      .eq("id", row.id);
    console.error(
      `email failed: booking=${input.bookingId} event=${input.eventType} to=${input.email} — ${message}`,
    );
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
//
// bookings.address at offer stage is already the general area, never
// the parent's exact street address (dispatch.ts's own comment: "never
// the parent's exact address before a caregiver has accepted") — safe
// to include as-is. The ward's own details are never fetched or
// mentioned here at all.
export async function notifyCaregiverNewOffer(booking: {
  id: string;
  staff_profile_id: string;
}): Promise<void> {
  const admin = createServiceRoleClient();
  const userId = await staffUserId(admin, booking.staff_profile_id);
  if (!userId) return;

  const [{ data: bookingRow }, { data: staffProfile }] = await Promise.all([
    admin
      .from("bookings")
      .select("starts_at, ends_at, duration_hours, address")
      .eq("id", booking.id)
      .maybeSingle(),
    admin
      .from("staff_profiles")
      .select("caregiver_type")
      .eq("id", booking.staff_profile_id)
      .maybeSingle(),
  ]);

  const careTypeLabel = staffProfile?.caregiver_type
    ? (CAREGIVER_TYPE_LABEL[staffProfile.caregiver_type] ?? staffProfile.caregiver_type)
    : "care";
  const dateLine = bookingRow ? formatDateLong(bookingRow.starts_at) : null;
  const timeLine = bookingRow ? formatTimeRange(bookingRow.starts_at, bookingRow.ends_at) : null;
  const durationLine = bookingRow ? `${bookingRow.duration_hours} hours` : null;
  const areaLine = bookingRow?.address ?? null;

  const detailLines = [
    `Care type: ${careTypeLabel}`,
    dateLine && `Date: ${dateLine}`,
    timeLine && `Time: ${timeLine}`,
    durationLine && `Duration: ${durationLine}`,
    areaLine && `Area: ${areaLine}`,
  ].filter((l): l is string => Boolean(l));

  const viewHref = `${appUrl()}/staff/requests`;

  await sendEmail(admin, {
    userId,
    bookingId: booking.id,
    eventType: "offer_created",
    email: await emailForUser(admin, userId),
    subject: "New Care Request Available — CareLink",
    body:
      `Hello,\n\nA new care request is waiting for you on CareLink.\n\n` +
      detailLines.join("\n") +
      `\n\nPlease open CareLink to review the details and respond. If you don't respond within the ` +
      `response window, this request may be offered to another caregiver.\n\n${viewHref}\n\n${BRAND_SIGNOFF}`,
    html: emailShell(
      `<p style="font-size:15px;margin:0 0 12px;">A new care request is waiting for you on CareLink.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:12px 0;">
        ${[
          ["Care type", careTypeLabel],
          dateLine ? ["Date", dateLine] : null,
          timeLine ? ["Time", timeLine] : null,
          durationLine ? ["Duration", durationLine] : null,
          areaLine ? ["Area", areaLine] : null,
        ]
          .filter((row): row is [string, string] => Boolean(row))
          .map(
            ([label, value]) =>
              `<tr><td style="padding:4px 12px 4px 0;color:#6b6478;">${label}</td><td style="padding:4px 0;font-weight:600;">${value}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="font-size:13px;color:#6b6478;margin:12px 0 0;">If you don't respond within the response window, this request may be offered to another caregiver.</p>`,
      { label: "View Request in CareLink", href: viewHref },
    ),
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

// ── Booking confirmed/paid — both sides ─────────────────────────────────
// Called from app/api/bookings/[id]/payments/route.ts the moment
// bookings.status genuinely flips to 'paid' there — today that's still
// FakePaymentProvider (lib/services/payment-provider.ts), a deterministic
// simulation rather than a real Paystack verification, but the status
// transition itself is a real row update, not a UI illusion, and neither
// email claims anything about how the payment was processed — only that
// the booking is confirmed, which is true the moment that row changes.
// Swap FakePaymentProvider for a real one later and these need no change.
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
