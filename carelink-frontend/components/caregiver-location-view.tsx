"use client";

import { useEffect, useState } from "react";
import { MapPinLine } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api/client";
import { minutesAgoLabel } from "@/lib/relative-time";
import { Sheet } from "@/components/ui/sheet";

type Location = { latitude: number; longitude: number; updated_at: string } | null;

// Parent-facing read-only view of the caregiver's SafeTrack location.
// Polling, not push — matches the existing payment-status polling
// pattern (usePaymentPolling in booking-detail.tsx) rather than adding a
// new realtime channel for one field. No map library is installed in
// this project, so the location is shown as coordinates plus a link out
// to the device's own maps app — a "simple location view", per the
// caregiver safety spec, rather than introducing a paid mapping service.
export function CaregiverLocationView({
  bookingId,
  active,
}: {
  bookingId: string;
  active: boolean;
}) {
  const [location, setLocation] = useState<Location>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    function poll() {
      apiFetch<{ location: Location }>(`/api/bookings/${bookingId}/location`)
        .then((res) => {
          if (cancelled) return;
          setLocation(res.location);
          setChecked(true);
        })
        .catch(() => {
          if (!cancelled) setChecked(true);
        });
    }
    poll();
    const interval = setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bookingId, active]);

  if (!active || !checked) return null;

  return (
    <Sheet className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
        <MapPinLine size={16} className="text-sage" />
        SafeTrack
      </h2>
      {location ? (
        <>
          <p className="text-[14px] font-semibold text-sage">Caregiver location sharing: ON</p>
          <p className="text-[13px] text-ink-muted">
            Last updated: {minutesAgoLabel(location.updated_at)}
          </p>
          <a
            href={`https://www.google.com/maps?q=${location.latitude},${location.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-fit text-[13px] font-semibold text-sage hover:text-sage-hover"
          >
            View on map →
          </a>
        </>
      ) : (
        <p className="text-[13px] text-ink-muted">Caregiver location sharing: OFF</p>
      )}
    </Sheet>
  );
}
