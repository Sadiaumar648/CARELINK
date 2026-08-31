"use client";

import { useEffect, useState } from "react";
import { Fire, FirstAid, ShieldWarning, Siren, X } from "@phosphor-icons/react";
import { SOS_REPORT_MARKER } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { minutesAgoLabel } from "@/lib/relative-time";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";

type EmergencyContacts = { police: string | null; fire: string | null; medical: string | null };
type SafeTrackLocation = { latitude: number; longitude: number; updated_at: string } | null;

const SAFETY_DISCLAIMER =
  "For immediate danger, contact the appropriate emergency service. CareLink Safety Team alerts are for CareLink follow-up and do not replace emergency services.";

// A tel: link when a number has been configured (admin Settings — this
// never invents or guesses one, per the caregiver safety spec §8-10);
// otherwise a plain instruction, never a fabricated digit string.
function EmergencyServiceOption({
  icon: Icon,
  label,
  description,
  number,
}: {
  icon: typeof Siren;
  label: string;
  description: string;
  number: string | null | undefined;
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sheet text-error">
        <Icon size={24} weight="fill" />
      </span>
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold text-ink">{label}</span>
        <span className="text-[12.5px] text-ink-muted">
          {number ? `Call ${number}` : `${description} — number not yet configured`}
        </span>
      </span>
    </>
  );

  if (!number) {
    return (
      <div className="flex min-h-[64px] items-center gap-4 rounded-[14px] border border-hairline bg-sheet px-4 py-3 opacity-80">
        {content}
      </div>
    );
  }

  return (
    <a
      href={`tel:${number}`}
      className="flex min-h-[64px] items-center gap-4 rounded-[14px] border border-error/40 bg-error-tint px-4 py-3 hover:border-error"
    >
      {content}
    </a>
  );
}

export function SosScreen({
  bookingSubjectUserId,
  bookingId,
  onClose,
}: {
  bookingSubjectUserId: string;
  bookingId: string;
  onClose: () => void;
}) {
  const [contacts, setContacts] = useState<EmergencyContacts | null>(null);
  const [confirmingAlert, setConfirmingAlert] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EmergencyContacts>("/api/settings/emergency-contacts")
      .then(setContacts)
      .catch(() => setContacts({ police: null, fire: null, medical: null }));
  }, []);

  async function sendAlert() {
    setSending(true);
    setError(null);
    try {
      // Best-effort: attach whatever SafeTrack location is currently on
      // file for this booking, never a guessed one — "Location
      // unavailable" if sharing isn't on or the lookup fails.
      const locationLine = await apiFetch<{ location: SafeTrackLocation }>(
        `/api/bookings/${bookingId}/location`,
      )
        .then((res) =>
          res.location
            ? `Last known location: ${res.location.latitude}, ${res.location.longitude} (updated ${minutesAgoLabel(res.location.updated_at)}).`
            : "Location unavailable.",
        )
        .catch(() => "Location unavailable.");

      await apiFetch("/api/reports", {
        method: "POST",
        body: {
          bookingId,
          subjectUserId: bookingSubjectUserId,
          category: "safety",
          description: `${SOS_REPORT_MARKER} — caregiver triggered an emergency safety alert during this booking at ${new Date().toLocaleString()}. ${locationLine}`,
        },
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-paper">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-[22px] font-semibold font-heading text-ink">
            <ShieldWarning size={26} weight="fill" className="text-error" />
            Emergency SOS
          </h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-sheet"
          >
            <X size={22} />
          </button>
        </div>

        {sent ? (
          <Sheet className="flex flex-col items-center gap-3 text-center">
            <ShieldWarning
              size={36}
              weight="fill"
              className="text-[var(--color-bluebell-pressed)]"
            />
            <h2 className="text-[18px] font-semibold font-heading">Alert sent to CareLink</h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">{SAFETY_DISCLAIMER}</p>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </Sheet>
        ) : (
          <>
            <p className="text-[15px] font-medium text-ink">
              Are you in immediate danger or is there an urgent emergency?
            </p>

            <div className="flex flex-col gap-3">
              <EmergencyServiceOption
                icon={Siren}
                label="Police / Security Emergency"
                description="For immediate threats or security emergencies"
                number={contacts?.police}
              />
              <EmergencyServiceOption
                icon={Fire}
                label="Fire & Rescue Emergency"
                description="For fire or rescue emergencies"
                number={contacts?.fire}
              />
              <EmergencyServiceOption
                icon={FirstAid}
                label="Medical Emergency"
                description="For a medical emergency involving you, the child, or anyone at the location"
                number={contacts?.medical}
              />

              {confirmingAlert ? (
                <Sheet className="flex flex-col gap-3 bg-bluebell-tint">
                  <p className="text-[14px] font-semibold text-ink">Send emergency alert?</p>
                  <p className="text-[13px] text-ink-muted">
                    This notifies the CareLink Safety Team for follow-up on this booking.
                  </p>
                  {error && <p className="text-[13px] text-error">{error}</p>}
                  <div className="flex gap-3">
                    <Button variant="danger" disabled={sending} onClick={() => void sendAlert()}>
                      {sending ? "Sending…" : "Send Alert"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={sending}
                      onClick={() => setConfirmingAlert(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </Sheet>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingAlert(true)}
                  className="flex min-h-[64px] items-center gap-4 rounded-[14px] border border-bluebell bg-bluebell-tint px-4 py-3 text-left hover:border-[var(--color-bluebell-pressed)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sheet text-[var(--color-bluebell-pressed)]">
                    <ShieldWarning size={24} weight="fill" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-[15px] font-semibold text-ink">
                      Alert CareLink Safety Team
                    </span>
                    <span className="text-[12.5px] text-ink-muted">
                      For CareLink follow-up — not an emergency service
                    </span>
                  </span>
                </button>
              )}
            </div>

            <p className="text-[12px] leading-relaxed text-ink-muted">{SAFETY_DISCLAIMER}</p>

            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
