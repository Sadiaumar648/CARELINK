"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";

// Starting a session requires a successful location permission check
// first — location sharing is mandatory for the duration of an active
// session (see SafeTrackCaregiverControl), so a caregiver must grant it
// before the session can start at all, not just once it's already
// active. Shared by the caregiver's Home ("Today's Care") and the
// booking detail page so this gate, and Start/End themselves, only
// live in one place. Renders nothing for any other booking status.
export function SessionActionButton({
  bookingId,
  status,
  isToday,
  onChanged,
  size = "default",
}: {
  bookingId: string;
  status: string;
  isToday: boolean;
  onChanged: () => void;
  size?: "default" | "lg";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(path: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}${path}`, { method: "PATCH" });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startSession() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setError(
        "Location sharing is required to start a session, but it isn't available on this device.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      () => void act("/start"),
      (geoErr) => {
        setBusy(false);
        setError(
          geoErr.code === geoErr.PERMISSION_DENIED
            ? "Location sharing is required to start a session. Allow location access in your browser's site settings, then try again."
            : "We couldn't get your location. Check your device's location settings, then try again.",
        );
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  if (status === "paid") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size={size}
          disabled={busy || !isToday}
          onClick={(e) => {
            e.preventDefault();
            startSession();
          }}
        >
          {isToday ? (busy ? "Starting…" : "Start session") : "Starts on the booking date"}
        </Button>
        {error && <p className="text-[12px] text-error">{error}</p>}
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <Button
          type="button"
          size={size}
          disabled={busy}
          onClick={(e) => {
            e.preventDefault();
            void act("/end");
          }}
        >
          {busy ? "Ending…" : "End session"}
        </Button>
        {error && <p className="text-[12px] text-error">{error}</p>}
      </div>
    );
  }

  return null;
}
