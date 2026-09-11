"use client";

import { useEffect, useRef, useState } from "react";
import { MapPinLine, ShieldCheck } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { minutesAgoLabel } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

// How often an actual update is sent to the backend — watchPosition can
// fire far more often than this as the device moves; a fix is only sent
// if at least this long has passed since the last one (caregiver safety
// spec §3: "a reasonable interval", not every GPS tick).
const SEND_INTERVAL_MS = 20_000;

type Status = "off" | "requesting" | "sharing" | "denied" | "unavailable";

// Caregiver-facing SafeTrack control. Location sharing is mandatory,
// not opt-in, for the duration of an active session — it starts
// automatically the moment a booking's status becomes 'active' (no
// button to tap, and no way to turn it off while the session stays
// active), and stops automatically the moment the session ends. Before
// that (accepted/paid), this shows an explanatory, non-functional card
// only — no permission prompt until there's a real active session to
// share a location for.
export function SafeTrackCaregiverControl({
  bookingId,
  bookingStatus,
}: {
  bookingId: string;
  bookingStatus: string;
}) {
  const active = bookingStatus === "active";
  const [status, setStatus] = useState<Status>("off");
  const [lastSentAt, setLastSentAt] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSendTimeRef = useRef(0);

  function stopWatching() {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }

  function enable() {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setStatus("sharing");
        const now = Date.now();
        if (now - lastSendTimeRef.current < SEND_INTERVAL_MS) return;
        lastSendTimeRef.current = now;
        apiFetch<{ location: { updated_at: string } }>(`/api/bookings/${bookingId}/location`, {
          method: "POST",
          body: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        })
          .then((res) => setLastSentAt(res.location.updated_at))
          .catch(() => undefined);
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
        stopWatching();
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
    );
  }

  // Mandatory: the moment this booking goes active, sharing starts on
  // its own — no caregiver action required, and (with no "Turn Off"
  // control below) no way to stop it short of the session itself
  // ending, which the effect's own cleanup (via the `active` flip)
  // already handles.
  useEffect(() => {
    if (!active) {
      stopWatching();
      return;
    }
    // enable() itself calls setStatus synchronously before the async
    // geolocation callbacks ever run — deferred a tick so this effect
    // never sets state directly in its own body.
    void Promise.resolve().then(enable);
    return stopWatching;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- enable/stopWatching are self-contained; only re-run when the session becomes active
  }, [active]);

  if (!active) {
    if (bookingStatus !== "accepted" && bookingStatus !== "paid") return null;
    return (
      <Sheet className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          <MapPinLine size={16} className="text-wisteria" />
          SafeTrack
        </h2>
        <p className="text-[13px] text-ink-muted">
          Location sharing is required for this care session and starts automatically once you begin
          it.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        <MapPinLine size={16} className="text-wisteria" />
        SafeTrack
      </h2>
      <p className="text-[13px] text-ink-muted">
        Location sharing is required for the duration of this care session, so the family and
        CareLink can see where you are — it stops automatically the moment the session ends.
      </p>

      {(status === "off" || status === "requesting") && (
        <p className="text-[13px] text-ink-muted">Requesting location access…</p>
      )}

      {status === "sharing" && (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-wisteria">
          <ShieldCheck size={16} weight="fill" /> Sharing your location
          {lastSentAt && ` — last sent ${minutesAgoLabel(lastSentAt)}`}
        </p>
      )}

      {status === "denied" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-error">
            Location sharing is required to continue this care session, but permission was denied.
            Enable location access in your browser&apos;s site settings, then try again.
          </p>
          <Button variant="secondary" onClick={enable} className="self-start">
            Try Again
          </Button>
        </div>
      )}

      {status === "unavailable" && (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-error">
            Location sharing is required for this session, but your location isn&apos;t available
            right now. Check your device&apos;s location settings, then try again.
          </p>
          <Button variant="secondary" onClick={enable} className="self-start">
            Try Again
          </Button>
        </div>
      )}
    </Sheet>
  );
}
