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
  { icon: typeof Bell; label: string; tone: "success" | "info" | "attention" | "neutral" }
> = {
  booking_request: { icon: Tray, label: "New booking request", tone: "neutral" },
  booking_accepted: { icon: CheckCircle, label: "Booking accepted", tone: "success" },
  booking_declined: { icon: WarningCircle, label: "Booking update", tone: "attention" },
  payment_received: { icon: Money, label: "Payment received", tone: "info" },
  booking_completed: { icon: CheckCircle, label: "Booking completed", tone: "success" },
  verification_verified: { icon: SealCheck, label: "Verification approved", tone: "success" },
  verification_rejected: { icon: XCircle, label: "Verification update", tone: "attention" },
};

export const DEFAULT_KIND_META = { icon: Bell, label: "Notification", tone: "neutral" as const };

export const TONE_CLASSES: Record<"success" | "info" | "attention" | "neutral", string> = {
  success: "bg-success-tint text-[var(--color-success)]",
  info: "bg-bluebell-tint text-bluebell-pressed",
  attention: "bg-error-tint text-error",
  neutral: "bg-paper text-ink-muted",
};
