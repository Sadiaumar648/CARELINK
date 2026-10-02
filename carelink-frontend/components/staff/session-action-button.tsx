"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";

// A session starts on its own the moment its scheduled time arrives
// (lib/services/session-lifecycle.ts on the backend) — there's no
// caregiver action to gate it on any more. This button now only ever
// renders "End session", once a booking reaches 'active'. Renders
// nothing for any other booking status.
export function SessionActionButton({
  bookingId,
  status,
  onChanged,
  size = "default",
}: {
  bookingId: string;
  status: string;
  onChanged: () => void;
  size?: "default" | "lg";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const scheduleHref = `/staff/schedule/${bookingId}`;

  async function act(path: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}${path}`, { method: "PATCH" });
      // Ending a session is the moment to leave a review for the family
      // (booking-detail.tsx's own CaregiverReviewForm shows automatically
      // once the booking is 'completed') — from anywhere other than that
      // page itself, go there now instead of leaving the caregiver on
      // Home with no way to review. Already on it: just refresh in
      // place, same as before, so the form appears right there.
      if (path === "/end" && pathname !== scheduleHref) {
        router.push(scheduleHref);
        return;
      }
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
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
