"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Star,
  Info,
  ShieldCheck,
  ClockCounterClockwise,
  ChatCircleText,
} from "@phosphor-icons/react";
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
  photo_path: string | null;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  languages: string[] | null;
  areas: { area: string; isPrimary: boolean }[];
  bio: string | null;
};

type Ward = { id: string; display_name: string; age_years: number };
type Booking = { id: string };

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TRUST_ITEMS = [
  "Identity verification before a caregiver can accept bookings",
  "A structured booking and Mobile Money payment process",
  "Ratings and reviews collected after every completed booking",
  "Reporting tools if something doesn't feel right",
];

function BookingRequestForm({ staffProfileId }: { staffProfileId: string }) {
  const router = useRouter();
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [wardsError, setWardsError] = useState<string | null>(null);
  const [wardId, setWardId] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 400) setWards([]);
        else setWardsError(errorMessage(err));
      });
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<{ booking: Booking }>("/api/bookings", {
        method: "POST",
        body: {
          staffProfileId,
          wardId,
          date,
          startTime,
          endTime,
          address,
          oneOffNotes: notes || undefined,
        },
      });
      router.push(`/parent/bookings/${res.booking.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  if (wardsError) return <p className="text-[13px] text-error">{wardsError}</p>;
  if (wards === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (wards.length === 0) {
    return (
      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">Add a child before requesting a booking.</p>
        <Link href="/parent/children" className="font-semibold text-sage">
          Add a child
        </Link>
      </Sheet>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold font-heading">Request a booking</h2>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="ward"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Care needed for
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
        label="Date"
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
      <Field
        label="Address"
        required
        value={address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <Field label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {error && <p className="text-[13px] text-error">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Requesting…" : "Request Booking →"}
      </Button>
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
                    className="flex items-center gap-1 text-[13px] font-semibold text-sage hover:text-sage-hover"
                    aria-expanded={verificationInfoOpen}
                  >
                    <VerificationBadge />
                    <Info size={14} />
                  </button>
                  {verificationInfoOpen && (
                    <p className="max-w-xs text-[12px] leading-relaxed text-ink-muted">
                      Verification means the caregiver&apos;s submitted identity information has
                      been reviewed according to CareLink&apos;s verification process.
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
              {caregiver.years_experience ?? 0} yrs experience
              {primaryArea ? ` · ${primaryArea}` : ""}
            </p>
            <p className="text-[24px] font-semibold tabular-nums">
              GH₵{caregiver.hourly_rate}
              <span className="text-[14px] font-normal text-ink-muted">/hr</span>
            </p>
          </div>
          <a
            href="#request-booking"
            className="rounded-[10px] bg-sage px-4 py-3 text-center text-[14px] font-semibold text-sheet hover:bg-sage-hover"
          >
            Request Booking →
          </a>
        </div>

        {/* RIGHT: about, experience, skills, languages, availability, reviews, trust, safety */}
        <div className="flex flex-col gap-6">
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
                    className="rounded-full bg-sage-tint px-3 py-1 text-[12.5px] font-medium text-sage-pressed"
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

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">Availability</h2>
            <p className="flex items-start gap-2 text-[13px] text-ink-muted">
              <ClockCounterClockwise size={16} className="mt-0.5 shrink-0" />
              Availability is checked against your requested date and time when you request a
              booking below.
            </p>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-[15px] font-semibold font-heading">Reviews</h2>
            {caregiver.rating_count > 0 ? (
              <p className="flex items-center gap-2 text-[14px] text-ink">
                <Star size={16} weight="fill" className="text-gold" />
                <span className="font-semibold">{caregiver.rating_avg?.toFixed(1)}</span>
                <span className="text-ink-muted">
                  average from {caregiver.rating_count} completed{" "}
                  {caregiver.rating_count === 1 ? "booking" : "bookings"}
                </span>
              </p>
            ) : (
              <p className="text-[14px] text-ink-muted">New to CareLink — no reviews yet.</p>
            )}
          </section>

          <Sheet className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold font-heading">
              <ShieldCheck size={18} className="text-sage" />
              Why parents choose verified CareLink caregivers
            </h2>
            <ul className="flex flex-col gap-1.5 text-[13px] text-ink-muted">
              {TRUST_ITEMS.map((item) => (
                <li key={item}>✓ {item}</li>
              ))}
            </ul>
          </Sheet>

          <section className="flex flex-col gap-3">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold font-heading">
              <ChatCircleText size={18} className="text-sage" />
              CareLink Safety
            </h2>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              CareLink uses identity verification, structured bookings and reporting tools to
              support safer interactions between families and caregivers.
            </p>
            <ReportForm subjectUserId={caregiver.user_id} />
          </section>

          <div id="request-booking" className="scroll-mt-6">
            <BookingRequestForm staffProfileId={caregiver.staff_profile_id} />
          </div>
        </div>
      </div>
    </div>
  );
}
