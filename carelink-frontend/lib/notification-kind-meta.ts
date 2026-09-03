import {
  Bell,
  CheckCircle,
  Money,
  SealCheck,
  Tray,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";

// One entry per real `kind` value a trigger in the database actually
// writes (see supabase/migrations/20260827210000_notifications.sql) —
// nothing here is invented. booking_request and payment_received are
// staff-facing in practice, but mapped anyway so this renders correctly
// no matter which role's notifications it's handed; any kind not listed
// here still renders fine via a fallback at the call site.
//
// Shared by /parent/notifications and the parent Home page's Recent
// Activity section, so both agree on the same icon/label/colour for a
// given notification kind instead of drifting independently.
export const KIND_META: Record<
  string,
  { icon: typeof Bell; label: string; tone: "info" | "attention" | "neutral" | "verified" }
> = {
  booking_request: { icon: Tray, label: "New booking request", tone: "neutral" },
  booking_accepted: { icon: CheckCircle, label: "Booking accepted", tone: "verified" },
  booking_declined: { icon: WarningCircle, label: "Booking update", tone: "attention" },
  payment_received: { icon: Money, label: "Payment received", tone: "info" },
  booking_completed: { icon: CheckCircle, label: "Booking completed", tone: "verified" },
  verification_verified: { icon: SealCheck, label: "Verification approved", tone: "verified" },
  verification_rejected: { icon: XCircle, label: "Verification update", tone: "attention" },
};

export const DEFAULT_KIND_META = { icon: Bell, label: "Notification", tone: "neutral" as const };

// Solid-colour circle + white glyph, matching the parent Home page's
// reference design (its only current consumer — see the module comment
// above). "verified" is CareLink's own wisteria purple, used for every
// positive/confirmed booking or verification event (booking accepted,
// booking completed, verification approved); "info" is the same colour
// but kept as its own name for payment_received, since it's a distinct
// kind of update rather than a confirmation.
export const TONE_CLASSES: Record<"info" | "attention" | "neutral" | "verified", string> = {
  info: "bg-wisteria text-white",
  attention: "bg-error text-white",
  neutral: "bg-ink-muted text-white",
  verified: "bg-wisteria text-white",
};
