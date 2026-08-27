"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Star } from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

type Caregiver = {
  staff_profile_id: string;
  full_name: string;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  bio: string | null;
};

type Ward = { id: string; display_name: string };
type Booking = { id: string };

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

  if (wardsError) return <p className="text-[13px] text-magenta">{wardsError}</p>;
  if (wards === null) return <p className="text-[13px] text-ink-muted">Loading…</p>;

  if (wards.length === 0) {
    return (
      <Sheet className="flex flex-col gap-2">
        <p className="text-[15px]">Add a child before requesting a booking.</p>
        <Link href="/parent/children" className="font-semibold text-cyan">
          Add a child
        </Link>
      </Sheet>
    );
  }

  return (
    <Sheet as="form" onSubmit={onSubmit} className="flex flex-col gap-4">
      <h2 className="text-[19px] font-semibold">Request a booking</h2>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="ward"
          className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
        >
          Child
        </label>
        <select
          id="ward"
          required
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          className="rounded border border-hairline bg-sheet px-3 py-2 text-[15px] text-ink"
        >
          <option value="" disabled>
            Choose a child
          </option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {w.display_name}
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
      {error && <p className="text-[13px] text-magenta">{error}</p>}
      <Button type="submit" disabled={submitting}>
        {submitting ? "Requesting…" : "Request booking"}
      </Button>
    </Sheet>
  );
}

export default function CaregiverProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [caregiver, setCaregiver] = useState<Caregiver | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ caregiver: Caregiver }>(`/api/caregivers/${id}`)
      .then((res) => setCaregiver(res.caregiver))
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  if (error) return <p className="p-6 text-[13px] text-magenta">{error}</p>;
  if (!caregiver) return <p className="p-6 text-[13px] text-ink-muted">Loading…</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-[26px] font-semibold">{caregiver.full_name}</h1>
        <p className="flex items-center gap-1 text-[15px] text-ink-muted">
          <Star size={16} weight="fill" />
          {caregiver.rating_avg ? caregiver.rating_avg.toFixed(1) : "New"} ({caregiver.rating_count}{" "}
          reviews) · {caregiver.years_experience ?? 0} yrs experience
        </p>
      </div>

      <Sheet className="flex flex-col gap-4">
        <p className="text-[28px] font-semibold tabular-nums">GH₵{caregiver.hourly_rate}/hr</p>
        <div className="flex flex-wrap gap-2">
          {caregiver.skills.map((s) => (
            <span key={s} className="rounded bg-hairline/40 px-2 py-1 text-[13px] text-ink-muted">
              {skillLabel(s)}
            </span>
          ))}
        </div>
        {caregiver.bio && <p className="text-[15px] leading-relaxed">{caregiver.bio}</p>}
      </Sheet>

      <BookingRequestForm staffProfileId={caregiver.staff_profile_id} />
    </div>
  );
}
