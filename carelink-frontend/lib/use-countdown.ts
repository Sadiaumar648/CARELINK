"use client";

import { useEffect, useState } from "react";

// A live countdown derived from a real server timestamp, never a
// frontend-owned duration — the backend is always what actually expires
// whatever this is counting down to (a caregiver's dispatch offer
// window, or a parent's payment window); this only displays what's
// already true, re-checked every tick against the real deadline. Shared
// by the caregiver's own offer-response countdown (app/staff/page.tsx)
// and the parent's payment-window countdown (the care-requests dispatch
// page and booking-detail.tsx) rather than three copies of the same
// mm:ss logic.
export function useCountdown(deadline: string | null | undefined): string | null {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!deadline) {
      void Promise.resolve().then(() => setLabel(null));
      return;
    }
    function tick() {
      const msLeft = new Date(deadline!).getTime() - Date.now();
      if (msLeft <= 0) {
        setLabel("Expiring…");
        return;
      }
      const totalSeconds = Math.floor(msLeft / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      setLabel(`${minutes}:${String(seconds).padStart(2, "0")}`);
    }
    // The first tick is a synchronous derived read, deferred out of the
    // effect body itself, same as this codebase's established pattern;
    // every tick after that runs from the interval's own callback.
    void Promise.resolve().then(tick);
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  return label;
}
