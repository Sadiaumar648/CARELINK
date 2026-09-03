"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Star,
  Info,
  ShieldCheck,
  ClockCounterClockwise,
  ChatCircleText,
  CheckCircle,
  ArrowLeft,
  SealCheck,
} from "@phosphor-icons/react";
import { hourlyRateFor } from "@carelink/shared";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Avatar } from "@/components/ui/avatar";
import { VerificationBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/empty-state";
import { ReportForm } from "@/components/report-form";
import { caregiverPhotoUrl } from "@/lib/photo-url";

type Caregiver = {
  staff_profile_id: string;
  user_id: string;
  full_name: string;
  verification_status: string;
  verification_method: "carelink" | "agency" | null;
  photo_path: string | null;
  caregiver_type: "nanny" | "babysitter" | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  languages: string[] | null;
  areas: { area: string; isPrimary: boolean }[];
  qualifications: {
    name: string;
    institution: string | null;
    year: number | null;
    verificationStatus: string;
  }[];
  bio: string | null;
};

function caregiverTypeLabel(type: "nanny" | "babysitter" | null): string | null {
  if (type === "nanny") return "Nanny";
  if (type === "babysitter") return "Babysitter";
  return null;
}

// CareLink's finalized fixed-rate model: what a booking actually costs
// is the fixed CareLink rate for this caregiver's type, never their own
// legacy hourly_rate field — this is informational only, since the real
// authoritative total is computed server-side in POST /api/bookings.
// Falls back to hourly_rate only for the rare caregiver with no type on
// file yet.
function displayRate(caregiver: Caregiver): number {
  return caregiver.caregiver_type ? hourlyRateFor(caregiver.caregiver_type) : caregiver.hourly_rate;
}

type Ward = { id: string; display_name: string; age_years: number };
type Booking = { id: string };

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function durationHours(date: string, startTime: string, endTime: string): number | null {
  if (!date || !startTime || !endTime) return null;
  const starts = new Date(`${date}T${startTime}:00`);
  const ends = new Date(`${date}T${endTime}:00`);
  const hours = (ends.getTime() - starts.getTime()) / 3_600_000;
  return hours > 0 ? hours : null;
}

function formatDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function BookingRequestForm({ caregiver }: { caregiver: Caregiver }) {
  const [step, setStep] = useState<"form" | "review" | "success">("form");
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [wardsError, setWardsError] = useState<string | null>(null);
  const [wardId, setWardId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [availabilityIssue, setAvailabilityIssue] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 400) setWards([]);
        else setWardsError(errorMessage(err));
      });
  }, []);

  const selectedWard = wards?.find((w) => w.id === wardId) ?? null;
  const hours = durationHours(date, startTime, endTime);
  const estimatedTotal = hours ? Math.round(displayRate(caregiver) * hours) : null;

  function goReview(e: React.FormEvent) {
    e.preventDefault();
    if (!wardId || !date || !startTime || !endTime || !address.trim()) {
      setFormError("Fill in every field before continuing.");
      return;
    }
    if (!hours) {
      setFormError("The end time must be after the start time.");
      return;
    }
    setFormError(null);
    setStep("review");
  }

  async function onSend() {
    setSubmitting(true);
    setSubmitError(null);
    setAvailabilityIssue(false);
    try {
      const res = await apiFetch<{ booking: Booking }>("/api/bookings", {
        method: "POST",
        body: {
          staffProfileId: caregiver.staff_profile_id,
          wardId,
          date,
          startTime,
          endTime,
          address,
          oneOffNotes: notes || undefined,
        },
      });
      setCreatedBooking(res.booking);
      setStep("success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setAvailabilityIssue(true);
      setSubmitError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (wardsError) return <p className="text-[13px] text-error">{wardsError}</p>;
  if (wards === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (wards.length === 0) {
    return (
      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">Add a child before requesting a booking.</p>
        <Link href="/parent/children" className="font-semibold text-wisteria">
          Add a child
        </Link>
      </Sheet>
    );
  }

  if (step === "success" && createdBooking) {
    return (
      <Sheet className="flex flex-col items-center gap-4 text-center">
        <CheckCircle size={44} weight="fill" className="text-[var(--color-success)]" />
        <h2 className="text-[22px] font-semibold font-heading">Request sent</h2>
        <p className="max-w-sm text-[14px] text-ink-muted">
          Your booking request has been sent to {caregiver.full_name}. We&apos;ll let you know when
          they respond.
        </p>
        <div className="flex w-full max-w-xs flex-col gap-1.5 rounded-[14px] border border-hairline p-4 text-left text-[13px]">
          <p>
            <span className="text-ink-muted">Caregiver:</span> {caregiver.full_name}
          </p>
          {selectedWard && (
            <p>
              <span className="text-ink-muted">Ward:</span> {selectedWard.display_name}
            </p>
          )}
          <p>
            <span className="text-ink-muted">Date:</span> {formatDateLong(date)}
          </p>
          <p>
            <span className="text-ink-muted">Time:</span> {startTime} – {endTime}
          </p>
          <p>
            <span className="text-ink-muted">Status:</span> Awaiting caregiver response
          </p>
        </div>
        <div className="flex gap-3">
          <Link href={`/parent/bookings/${createdBooking.id}`}>
            <Button>View Booking</Button>
          </Link>
          <Link href="/parent/find-care">
            <Button variant="secondary">Back to Find Care</Button>
          </Link>
        </div>
      </Sheet>
    );
  }

  if (step === "review") {
    return (
      <Sheet className="flex flex-col gap-5">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={14} /> Edit
        </button>
        <h2 className="text-[19px] font-semibold font-heading">Review your booking</h2>

        <div className="flex flex-col gap-2 text-[14px]">
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-ink-muted">Caregiver</span>
            <span className="font-semibold">{caregiver.full_name}</span>
          </div>
          {selectedWard && (
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-ink-muted">Ward</span>
              <span className="font-semibold">
                {selectedWard.display_name}, {selectedWard.age_years}
              </span>
            </div>
          )}
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-ink-muted">Date</span>
            <span className="font-semibold">{formatDateLong(date)}</span>
          </div>
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-ink-muted">Time</span>
            <span className="font-semibold">
              {startTime} – {endTime}
            </span>
          </div>
          {hours && (
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-ink-muted">Duration</span>
              <span className="font-semibold">
                {hours} {hours === 1 ? "hour" : "hours"}
              </span>
            </div>
          )}
          <div className="flex justify-between border-b border-hairline pb-2">
            <span className="text-ink-muted">Rate</span>
            <span className="font-semibold tabular-nums">GH₵{displayRate(caregiver)}/hr</span>
          </div>
          {estimatedTotal !== null && (
            <div className="flex justify-between border-b border-hairline pb-2">
              <span className="text-ink-muted">Estimated total</span>
              <span className="font-semibold tabular-nums">GH₵{estimatedTotal}</span>
            </div>
          )}
          {notes && (
            <div className="flex flex-col gap-1 pb-2">
              <span className="text-ink-muted">Additional instructions</span>
              <span>{notes}</span>
            </div>
          )}
        </div>

        <Sheet className="flex flex-col gap-2 bg-paper">
          <p className="text-[13px] font-semibold text-ink">Before you request</p>
          <p className="text-[13px] text-ink-muted">
            This is a booking request. Your booking is not confirmed until the caregiver accepts it.
          </p>
          <label className="flex items-start gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            I understand that this is a booking request and is not confirmed until the caregiver
            accepts it.
          </label>
        </Sheet>

        {submitError && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-error">{submitError}</p>
            {availabilityIssue && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => setStep("form")}>
                  Choose another time
                </Button>
                <Link href="/parent/find-care">
                  <Button type="button" variant="secondary">
                    Find another caregiver
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        <Button onClick={() => void onSend()} disabled={!agreed || submitting}>
          {submitting ? "Sending booking request…" : "Send Booking Request →"}
        </Button>
      </Sheet>
    );
  }

  return (
    <Sheet as="form" onSubmit={goReview} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-[19px] font-semibold font-heading">Request a booking</h2>
        <p className="text-[13px] text-ink-muted">
          Tell us when you need care and we&apos;ll send your request to {caregiver.full_name}.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="ward"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Who needs care?
        </label>
        <select
          id="ward"
          required
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        >
          <option value="" disabled>
            Choose a child
          </option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.display_name} — {w.age_years} years old
            </option>
          ))}
        </select>
      </div>
      <Field
        label="When do you need care?"
        type="date"
        required
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Start time"
          type="time"
          required
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />
        <Field
          label="End time"
          type="time"
          required
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
        />
      </div>
      {hours && (
        <p className="text-[12.5px] text-ink-muted">
          {startTime} — {endTime} · {hours} {hours === 1 ? "hour" : "hours"}
        </p>
      )}
      <Field
        label="Address"
        required
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        <label
          htmlFor="notes"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Anything the caregiver should know?
        </label>
        <textarea
          id="notes"
          rows={3}
          placeholder="Share helpful information about the care needed…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
        />
      </div>
      {formError && <p className="text-[13px] text-error">{formError}</p>}
      <Button type="submit">Review Request →</Button>
    </Sheet>
  );
}

export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationInfoOpen, setVerificationInfoOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    apiFetch<{ caregiver: Caregiver }>(`/api/caregivers/${id}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setError(errorMessage(err)));
  }, [id, retryKey]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <ErrorState onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (!caregiver) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="flex items-center gap-4">
          <div className="h-28 w-28 animate-pulse rounded-full bg-hairline/60" />
          <div className="flex flex-col gap-2">
            <div className="h-6 w-40 animate-pulse rounded bg-hairline/60" />
            <div className="h-4 w-56 animate-pulse rounded bg-hairline/60" />
          </div>
        </div>
        <div className="h-40 animate-pulse rounded-[18px] bg-hairline/40" />
      </div>
    );
  }

  const primaryArea =
    caregiver.areas?.find((a) => a.isPrimary)?.area ?? caregiver.areas?.[0]?.area ?? null;
  const isVerified = caregiver.verification_status === "verified";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <Link
        href="/parent/find-care"
        className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Find Care
      </Link>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[300px_1fr]">
        {/* LEFT: photo + core facts + primary CTA */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
          <div className="flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
            <Avatar
              photoUrl={caregiverPhotoUrl(caregiver.photo_path)}
              name={caregiver.full_name}
              size="lg"
              className="h-32 w-32 lg:h-40 lg:w-40"
            />
            <div className="flex flex-col gap-1">
              <h1 className="text-[24px] font-semibold font-heading">{caregiver.full_name}</h1>
              {isVerified && (
                <div className="flex flex-col items-center gap-1 lg:items-start">
                  <button
                    type="button"
                    onClick={() => setVerificationInfoOpen((o) => !o)}
                    className="flex items-center gap-1 text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                    aria-expanded={verificationInfoOpen}
                  >
                    <VerificationBadge method={caregiver.verification_method} />
                    <Info size={14} />
                  </button>
                  {verificationInfoOpen && (
                    <p className="max-w-xs text-[12px] leading-relaxed text-ink-muted">
                      {caregiver.verification_method === "agency"
                        ? "This caregiver's identity was verified by the agency before joining CareLink."
                        : "Verification means the caregiver's submitted identity information has been reviewed according to CareLink's verification process."}
                    </p>
                  )}
                </div>
              )}
            </div>
            <p className="flex items-center gap-1 text-[14px] text-ink-muted">
              <Star size={15} weight="fill" className="text-gold" />
              <span className="font-semibold text-ink">
                {caregiver.rating_avg ? caregiver.rating_avg.toFixed(1) : "New"}
              </span>
              {caregiver.rating_count > 0 && <span>· {caregiver.rating_count} reviews</span>}
            </p>
            <p className="text-[13px] text-ink-muted">
              {caregiverTypeLabel(caregiver.caregiver_type)
                ? `${caregiverTypeLabel(caregiver.caregiver_type)} · `
                : ""}
              {caregiver.years_experience ?? 0} yrs experience
              {primaryArea ? ` · ${primaryArea}` : ""}
            </p>
            <p className="text-[24px] font-semibold tabular-nums">
              GH₵{displayRate(caregiver)}
              <span className="text-[14px] font-normal text-ink-muted">/hr</span>
            </p>
          </div>
          <a
            href="#request-booking"
            className="rounded-[10px] bg-wisteria px-4 py-3 text-center text-[14px] font-semibold text-sheet hover:bg-wisteria-hover"
          >
            Request Booking →
          </a>
        </div>

        {/* RIGHT: about, experience, skills, languages, availability, trust, safety */}
        <div className="flex flex-col gap-5">
          {caregiver.bio && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-semibold font-heading">
                About {caregiver.full_name.split(" ")[0]}
              </h2>
              <p className="text-[14px] leading-relaxed text-ink">{caregiver.bio}</p>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-[15px] font-semibold font-heading">Experience</h2>
            <p className="text-[14px] text-ink-muted">
              {caregiver.years_experience ?? 0} years of childcare experience
            </p>
            {caregiver.skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {caregiver.skills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-wisteria-tint px-3 py-1 text-[12.5px] font-medium text-wisteria-pressed"
                  >
                    {skillLabel(s)}
                  </span>
                ))}
              </div>
            )}
          </section>

          {caregiver.languages && caregiver.languages.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-semibold font-heading">Languages</h2>
              <p className="text-[14px] text-ink-muted">{caregiver.languages.join(", ")}</p>
            </section>
          )}

          {caregiver.qualifications.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-[15px] font-semibold font-heading">
                Qualifications & Certifications
              </h2>
              <ul className="flex flex-col gap-1.5">
                {caregiver.qualifications.map((q, i) => (
                  <li key={i} className="flex items-center gap-2 text-[14px] text-ink-muted">
                    {q.verificationStatus === "verified" && (
                      <SealCheck
                        size={14}
                        weight="fill"
                        className="shrink-0 text-[var(--color-success)]"
                      />
                    )}
                    <span>
                      {q.name}
                      {q.institution ? ` — ${q.institution}` : ""}
                      {q.year ? ` (${q.year})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">Availability</h2>
            <p className="flex items-start gap-2 text-[13px] text-ink-muted">
              <ClockCounterClockwise size={16} className="mt-0.5 shrink-0" />
              Availability is checked against your requested date and time when you request a
              booking below.
            </p>
          </section>

          <p className="flex items-center gap-2 text-[12.5px] text-ink-muted">
            <ShieldCheck size={15} className="shrink-0 text-wisteria" />
            Verified identity, structured Mobile Money payments, and post-booking ratings keep every
            CareLink booking accountable.
          </p>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold font-heading">
              <ChatCircleText size={18} className="text-wisteria" />
              CareLink Safety
            </h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              CareLink uses identity verification, structured bookings and reporting tools to
              support safer interactions between families and caregivers.
            </p>
            <ReportForm subjectUserId={caregiver.user_id} />
          </section>

          <div id="request-booking" className="scroll-mt-6">
            <BookingRequestForm caregiver={caregiver} />
          </div>
        </div>
      </div>
    </div>
  );
}
