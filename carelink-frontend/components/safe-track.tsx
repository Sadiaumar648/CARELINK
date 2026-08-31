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

// Caregiver-facing SafeTrack control. Location is only ever requested
// once the caregiver explicitly opts in here — never on page load, never
// before a booking is confirmed. On an accepted/paid booking this shows
// an explanatory, non-functional card only (no permission prompt); the
// working control (and any geolocation request) appears once the
// booking is actually active.
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

  // The session ending (however that happens — this caregiver's own
  // "End session" button, or the parent ending it) must stop updates
  // immediately, not just when this component's own toggle is used. No
  // setState here: a booking only ever leaves "active" by going to
  // "completed" (see enforce_booking_transition), never back, so the
  // component's own !active render branch below already stops reading
  // `status` for good the moment that happens — nothing needs resetting.
  useEffect(() => {
    if (!active) stopWatching();
    return stopWatching;
  }, [active]);

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

  function disable() {
    stopWatching();
    setStatus("off");
    setLastSentAt(null);
    void apiFetch(`/api/bookings/${bookingId}/location`, { method: "DELETE" }).catch(
      () => undefined,
    );
  }

  if (!active) {
    if (bookingStatus !== "accepted" && bookingStatus !== "paid") return null;
    return (
      <Sheet className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
          <MapPinLine size={16} className="text-sage" />
          SafeTrack
        </h2>
        <p className="text-[13px] text-ink-muted">
          Location sharing will be available once you start this care session.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        <MapPinLine size={16} className="text-sage" />
        SafeTrack
      </h2>
      <p className="text-[13px] text-ink-muted">
        Share your live location with the family for the duration of this care session only —
        sharing stops automatically the moment the session ends.
      </p>

      {status === "off" && (
        <Button onClick={enable} className="self-start">
          Enable SafeTrack
        </Button>
      )}

      {status === "requesting" && (
        <p className="text-[13px] text-ink-muted">Waiting for location permission…</p>
      )}

      {status === "sharing" && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-sage">
            <ShieldCheck size={16} weight="fill" /> Sharing your location
            {lastSentAt && ` — last sent ${minutesAgoLabel(lastSentAt)}`}
          </p>
          <Button variant="secondary" onClick={disable} className="self-start">
            Turn Off SafeTrack
          </Button>
        </div>
      )}

      {status === "denied" && (
        <p className="text-[13px] text-error">
          Location permission was denied. Enable it in your browser&apos;s site settings to use
          SafeTrack for this session.
        </p>
      )}

      {status === "unavailable" && (
        <p className="text-[13px] text-error">
          Your location isn&apos;t available right now. You can try again, or continue the session
          without SafeTrack.
        </p>
      )}
    </Sheet>
  );
}
