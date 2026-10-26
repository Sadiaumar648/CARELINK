"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus } from "@phosphor-icons/react";
import {
  CARE_DAY_HOURS,
  MAX_CARE_DAYS,
  calculateTotalAmount,
  hourlyRateFor,
} from "@carelink/shared";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { LocationPicker, type ResolvedLocation } from "@/components/location-picker";
import { AddWardForm } from "@/components/parent/add-ward-form";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { suggestedSkillForAge, type SearchFilters, type Ward } from "@/components/find-care/types";

type CaregiverType = "nanny" | "babysitter";

export type RequestFlowInitial = {
  startDate?: string;
  schedule?: string;
  days?: string;
  hours?: string;
  area?: string;
  age?: string;
  requirements?: string;
};

// "Request Care Again" (the exhausted-dispatch retry flow): the exact
// shape of a real care_requests row (GET /api/care-requests/[id]) — the
// authoritative source for restoring every field, never fragile
// frontend-only state, so it survives a refresh or a fresh visit to
// the same retry link. Deliberately distinct from RequestFlowInitial
// above, which only ever carries the CareLink AI/find-care round trip's
// looser vocabulary (a coarse area string, no real coordinates) — this
// is the real, structured record.
export type RequestFlowRestore = {
  wardId: string | null;
  wardIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  durationDays: number;
  location: string;
  serviceAddress: string;
  serviceLatitude: number;
  serviceLongitude: number;
  locationPlaceId: string | null;
  locationSource: "current_location" | "gps_address";
  skills: string[] | null;
  notes: string | null;
  repeatMode: "once" | "weekly" | "custom";
  repeatWeekdays: string[];
  repeatStartDate: string | null;
  repeatEndDate: string | null;
};

// Every real occurrence's notes field is the parent's own free text
// plus, for Weekly/Custom, this exact auto-generated schedule summary
// appended after it (see onSubmit below) — restoring the free-text
// "Anything else" field strips that summary back off deterministically
// (never a guess: this is reversing this component's own, fixed
// concatenation), since the restored form already reconstructs the
// real schedule from repeatMode/repeatWeekdays/repeatStartDate/
// repeatEndDate directly.
const AUTO_SCHEDULE_NOTE_MARKER = "Repeats: every";
function extractFreeTextNotes(notes: string | null | undefined): string {
  if (!notes) return "";
  const idx = notes.indexOf(AUTO_SCHEDULE_NOTE_MARKER);
  return (idx === -1 ? notes : notes.slice(0, idx)).trim();
}

// Exported so the CareLink AI page can map its own gathered startTime
// back onto one of these named blocks when handing off to this form.
export const SCHEDULE_OPTIONS = [
  { value: "morning", label: "Morning (6:00am – 12:00pm)", startTime: "06:00", endTime: "12:00" },
  {
    value: "afternoon",
    label: "Afternoon (12:00pm – 5:00pm)",
    startTime: "12:00",
    endTime: "17:00",
  },
  { value: "evening", label: "Evening (5:00pm – 9:00pm)", startTime: "17:00", endTime: "21:00" },
  {
    value: "overnight",
    label: "Overnight (9:00pm – 11:45pm)",
    startTime: "21:00",
    endTime: "23:45",
  },
] as const;

// Duration is a number of days now — each day a standard CARE_DAY_HOURS
// care day starting at the chosen start time.
const DAYS_OPTIONS = Array.from({ length: MAX_CARE_DAYS }, (_, i) => i + 1).map((n) => ({
  value: String(n),
  label: `${n} day${n === 1 ? "" : "s"}`,
}));

// The 7 real, existing skill_tag values this app's matching already
// understands — relabelled for a parent instead of a caregiver's own
// profile form, not a new taxonomy. "Other" isn't a real filter; it just
// reveals the free-text field below for anything not covered here.
const REQUIREMENT_CHIPS: { value: string; label: string }[] = [
  { value: "newborn_care", label: "Newborn care" },
  { value: "infant_care", label: "Infant care" },
  { value: "toddler_care", label: "Supervised play" },
  { value: "school_age_supervision", label: "Homework & learning" },
  { value: "meal_preparation", label: "Meals / Feeding" },
  { value: "special_needs_care", label: "Special needs care" },
  { value: "light_housekeeping", label: "Light housekeeping" },
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2 text-[15px] text-ink focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// hh:mm + N hours → hh:mm, capped so it never crosses midnight — a late
// start time (e.g. 6pm) genuinely produces a shorter day than
// CARE_DAY_HOURS, since care_requests/bookings has no separate end date
// column to represent a session that runs past midnight.
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = Math.min(h * 60 + m + hours * 60, 23 * 60 + 45);
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

// hh:mm → hh:mm, in hours — the actual span between the two, used to
// price and label a day whose end time was capped by addHours above, so
// a late start time is never priced as if it got the full
// CARE_DAY_HOURS (the server computes the real charge from this same
// start/end pair, in app/api/care-requests/route.ts).
function hoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

// 5.75 -> "5.75", 8 -> "8" — never a needless trailing ".00".
function formatHours(hours: number): string {
  return Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function RequestFlowPanel({
  type,
  onBack,
  initial,
  restoreFrom,
}: {
  // Kept only for the "Request Care Again" retry path, which restores a
  // real historical care_requests row that may genuinely say
  // "babysitter" — used solely for the (now type-independent) price
  // calculation below, never shown to the parent (see HEADING above).
  type: CaregiverType;
  onBack: () => void;
  initial?: RequestFlowInitial;
  // "Request Care Again": present only on the exhausted-dispatch retry
  // path, restoring every field from the real, saved care_requests row
  // — mutually exclusive with `initial` in practice (a panel opens via
  // exactly one entry point), so wherever both could apply below,
  // restoreFrom takes precedence.
  restoreFrom?: RequestFlowRestore;
}) {
  const router = useRouter();
  // Repeat/schedule-pattern support was removed — every request is a
  // single occurrence now. Restoring an old saved request that did have
  // a repeat pattern (repeatMode 'weekly'/'custom') just takes its one
  // real occurrence date/time, same as any other; there's no more UI to
  // show the pattern itself.
  const [startDate, setStartDate] = useState(() => {
    if (restoreFrom) return restoreFrom.date;
    return initial?.startDate ?? "";
  });
  const [startTime, setStartTime] = useState(() => {
    if (restoreFrom) return restoreFrom.startTime.slice(0, 5);
    const matched = SCHEDULE_OPTIONS.find((s) => s.value === initial?.schedule);
    return matched?.startTime ?? "";
  });
  // How many consecutive days of care (each a standard CARE_DAY_HOURS
  // day starting at startTime). initial?.days from the CareLink AI flow
  // is "N days a week" — a frequency, not a run length — so it isn't
  // reused here.
  const [days, setDays] = useState(() => {
    if (restoreFrom) return String(restoreFrom.durationDays || 1);
    return "1";
  });
  const [location, setLocation] = useState<ResolvedLocation | null>(() =>
    restoreFrom
      ? {
          formattedAddress: restoreFrom.serviceAddress,
          latitude: restoreFrom.serviceLatitude,
          longitude: restoreFrom.serviceLongitude,
          placeId: restoreFrom.locationPlaceId,
          coarseArea: restoreFrom.location,
          source: restoreFrom.locationSource,
        }
      : null,
  );
  const [requirementChips, setRequirementChips] = useState<Set<string>>(
    () => new Set(restoreFrom?.skills ?? []),
  );
  const [showOther, setShowOther] = useState(() =>
    restoreFrom ? Boolean(extractFreeTextNotes(restoreFrom.notes)) : Boolean(initial?.requirements),
  );
  const [requirements, setRequirements] = useState(() =>
    restoreFrom ? extractFreeTextNotes(restoreFrom.notes) : (initial?.requirements ?? ""),
  );
  const [wards, setWards] = useState<Ward[] | null>(null);
  // One request can be for more than one child. First entry = primary.
  const [wardIds, setWardIds] = useState<string[]>(() => {
    if (restoreFrom?.wardIds?.length) return restoreFrom.wardIds;
    return restoreFrom?.wardId ? [restoreFrom.wardId] : [];
  });
  // Adding a child from here never navigates away — it shows the same
  // real Add Child form inline (components/parent/add-ward-form.tsx),
  // so nothing already filled in on this request is ever lost. Settings
  // → Ward Profiles reuses the exact same component for the same reason
  // it should behave identically there.
  const [addingWard, setAddingWard] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Every field the backend will require — checked before "Find Care"
  // (surfacing it early) and again before "Send Request".
  function formValidationError(): string | null {
    if (wardIds.length === 0) return "Choose which child (or children) this request is for.";
    if (!startTime) return "Choose a start time to continue.";
    if (requirementChips.size === 0 && !(showOther && requirements.trim()))
      return "Choose at least one care need.";
    if (!startDate) return "Choose a date to continue.";
    // CareLink's strict rule: no valid, map-resolved location, no
    // request — enforced here and again by the backend.
    if (!location)
      return "Where will care take place? Please provide an exact GPS location so we can find nannies who can serve you.";
    return null;
  }

  // "Find Care" *is* the real submit now — CareLink assigns the
  // top-ranked eligible caregiver automatically (lib/services/
  // dispatch.ts), so there's no intermediate pick-a-caregiver step here
  // any more. The tracking page (/parent/care-requests/[id]) is where a
  // parent sees who they were matched with, and can browse and switch
  // to someone else themselves if they'd rather not use that caregiver.
  async function onFindCare(e: React.FormEvent) {
    e.preventDefault();
    const err = formValidationError();
    if (err) {
      setFormError(err);
      return;
    }
    if (submitting || !location) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const endTime = addHours(startTime, CARE_DAY_HOURS);
      // The coarse area — never the full address — is what still feeds
      // the existing area-string search/dispatch filters, exactly as a
      // typed area name did before.
      const searchArea = location.coarseArea ?? location.formattedAddress;
      const filters: SearchFilters = { date: startDate, startTime, endTime, area: searchArea };
      if (requirementChips.size > 0) filters.skills = Array.from(requirementChips);

      const res = await apiFetch<{ careRequest: { id: string } }>("/api/care-requests", {
        method: "POST",
        body: {
          wardIds,
          source: "direct",
          // Every caregiver is a Nanny to parents now — there's no type
          // choice here, and no specific caregiver picked yet either.
          caregiverType: "nanny",
          date: filters.date,
          startTime: filters.startTime,
          endTime: filters.endTime,
          durationDays: Number(days),
          location: searchArea,
          serviceAddress: location.formattedAddress,
          serviceLatitude: location.latitude,
          serviceLongitude: location.longitude,
          locationPlaceId: location.placeId ?? undefined,
          locationSource: location.source,
          locationResolved: true,
          skills: filters.skills,
          notes: requirements.trim() || undefined,
        },
      });
      await apiFetch(`/api/care-requests/${res.careRequest.id}/dispatch/start`, { method: "POST" });
      router.push(`/parent/care-requests/${res.careRequest.id}`);
    } catch (err) {
      setSubmitting(false);
      setFormError(errorMessage(err));
    }
  }

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch(() => setWards([]));
  }, []);

  const selectedWards = (wards ?? []).filter((w) => wardIds.includes(w.id));

  function toggleWard(id: string) {
    setWardIds((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id]));
  }

  // A best-effort default (a single child, or a match against the age
  // the AI already gathered on a round trip) — never auto-picked without
  // a real ward existing, and the parent can always change it.
  useEffect(() => {
    if (!wards || wardIds.length > 0) return;
    const suggested =
      wards.length === 1
        ? wards[0].id
        : (wards.find((w) => String(w.age_years) === initial?.age)?.id ?? null);
    if (!suggested) return;
    void Promise.resolve().then(() => setWardIds([suggested]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial is a one-time prefill, not a live dependency
  }, [wards, wardIds.length]);

  // Pre-check the age-appropriate chip for the youngest selected child —
  // visible, adjustable, never hidden magic: the chip state itself is
  // what gets submitted, not a silent extra filter.
  const youngestSelectedAge =
    selectedWards.length > 0 ? Math.min(...selectedWards.map((w) => w.age_years)) : null;
  useEffect(() => {
    if (youngestSelectedAge == null) return;
    const suggested = suggestedSkillForAge(youngestSelectedAge);
    void Promise.resolve().then(() => {
      setRequirementChips((prev) => (prev.has(suggested) ? prev : new Set(prev).add(suggested)));
    });
  }, [youngestSelectedAge]);

  function toggleChip(value: string) {
    setRequirementChips((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // CareLink's finalized fixed-rate model: informational only, but
  // computed from the exact same start/end time pair the backend will
  // independently recompute and charge from (POST /api/care-requests,
  // never trusting this figure) — a standard CARE_DAY_HOURS-hour care
  // day, unless a late start time caps it shorter (see addHours above),
  // in which case this shows the real, shorter total rather than the
  // full 8-hour one that won't actually be charged. The regular rate is
  // charged once per child per day either way.
  const priceDays = Math.max(1, Number(days));
  const priceChildCount = Math.max(1, wardIds.length);
  const priceDailyHours = startTime
    ? hoursBetween(startTime, addHours(startTime, CARE_DAY_HOURS))
    : CARE_DAY_HOURS;
  const priceTotal = calculateTotalAmount(type, priceDailyHours, priceDays, priceChildCount);

  // Find Care stays disabled until every field the backend will actually
  // require is genuinely filled in — mirrors onFindCare's own checks
  // above, just surfaced before the click instead of after it.
  const hasCareNeed = requirementChips.size > 0 || (showOther && Boolean(requirements.trim()));
  const canFindCare =
    wardIds.length > 0 &&
    Boolean(startTime) &&
    Boolean(days) &&
    Boolean(startDate) &&
    Boolean(location) &&
    hasCareNeed;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* No "Request a Nanny" title block — the Back button and the
          numbered sections already say where the parent is. */}

      <div className="w-full">
        {addingWard ? (
          // Rendered in place of the request form itself (never nested
          // inside it — a <form> can't legally contain another <form>).
          // Nothing about the request the parent has already started is
          // lost: every other field here lives in this component's own
          // state, untouched by which Sheet is currently on screen.
          <AddWardForm
            onAdded={(w) => {
              setWards((prev) => [...(prev ?? []), w]);
              setWardIds((prev) => (prev.includes(w.id) ? prev : [...prev, w.id]));
              setAddingWard(false);
            }}
            onCancel={() => setAddingWard(false)}
          />
        ) : (
          <Sheet
            as="form"
            onSubmit={onFindCare}
            className="flex flex-col gap-6 border-[var(--color-lavender-border)]"
          >
            {/* 1. WHO NEEDS CARE */}
            <section className="flex flex-col gap-3">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wisteria text-[11px] text-white">
                  1
                </span>
                Who needs care?
              </h2>

              {wards === null && (
                <p className="text-[13px] text-ink-muted">Loading your children…</p>
              )}

              {wards && wards.length === 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddingWard(true)}
                  className="justify-center border-dashed"
                >
                  <Plus size={16} /> Add a child before requesting care
                </Button>
              )}

              {wards && wards.length > 0 && (
                <div className="flex flex-col gap-2">
                  {wards.length > 1 && (
                    <p className="text-[12px] text-ink-muted">
                      Select every child who needs care in this session.
                    </p>
                  )}
                  {wards.map((w) => {
                    const checked = wardIds.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleWard(w.id)}
                        className={`flex items-center justify-between gap-3 rounded-[12px] border p-3 text-left transition-colors ${
                          checked
                            ? "border-wisteria bg-wisteria-tint"
                            : "border-[var(--color-lavender-border)] hover:border-wisteria"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar photoUrl={null} name={w.display_name} size="sm" />
                          <div>
                            <p className="text-[14px] font-semibold text-ink">{w.display_name}</p>
                            <p className="text-[12.5px] text-ink-muted">Age {w.age_years}</p>
                          </div>
                        </div>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                            checked
                              ? "border-wisteria bg-wisteria text-white"
                              : "border-[var(--color-lavender-border)]"
                          }`}
                        >
                          {checked && <Check size={13} weight="bold" />}
                        </span>
                      </button>
                    );
                  })}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddingWard(true)}
                    className="justify-center border-dashed"
                  >
                    <Plus size={16} /> Add another child
                  </Button>
                </div>
              )}
            </section>

            {/* 2. WHEN */}
            <section className="flex flex-col gap-3 border-t border-[var(--color-lavender-border)] pt-6">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wisteria text-[11px] text-white">
                  2
                </span>
                When do you need care?
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
                />
                <Field
                  label="Start time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
                />
                <SelectField
                  label="Number of days"
                  value={days}
                  onChange={setDays}
                  options={DAYS_OPTIONS}
                />
              </div>
              <p className="text-[12px] text-ink-muted">
                Each day is a standard {CARE_DAY_HOURS}-hour care day starting at your chosen start
                time.
              </p>
            </section>

            {/* 3. WHERE */}
            <section className="flex flex-col gap-2 border-t border-[var(--color-lavender-border)] pt-6">
              <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wisteria text-[11px] text-white">
                  3
                </span>
                Where will care take place?
              </h2>
              <LocationPicker
                value={location}
                onChange={setLocation}
                initialQuery={initial?.area}
                helperText="We'll use this location to find suitable nearby caregivers."
                layout="radio"
              />
            </section>

            {/* 4. WHAT HELP */}
            <section className="flex flex-col gap-3 border-t border-[var(--color-lavender-border)] pt-6">
              <div>
                <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-wisteria text-[11px] text-white">
                    4
                  </span>
                  What else do you need help with?
                </h2>
                <p className="ml-7 text-[12px] text-ink-muted">Select all that apply.</p>
              </div>
              <div className="ml-7 flex flex-wrap gap-2">
                {REQUIREMENT_CHIPS.map((chip) => {
                  const active = requirementChips.has(chip.value);
                  return (
                    <button
                      key={chip.value}
                      type="button"
                      onClick={() => toggleChip(chip.value)}
                      className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                        active
                          ? "border-wisteria bg-wisteria text-white"
                          : "border-[var(--color-lavender-border)] bg-sheet text-ink hover:border-wisteria"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setShowOther((s) => !s)}
                  className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                    showOther
                      ? "border-wisteria bg-wisteria text-white"
                      : "border-[var(--color-lavender-border)] bg-sheet text-ink hover:border-wisteria"
                  }`}
                >
                  Other
                </button>
              </div>
            </section>

            {/* ANYTHING ELSE — the same field "Other" reveals. If a parent
              picks Other above, they type their specific need in here
              directly; there's deliberately no second, duplicate input
              for it. */}
            {showOther && (
              <section className="flex flex-col gap-2">
                <label htmlFor="requirements" className="ml-7 text-[13px] font-semibold text-ink">
                  Anything else? <span className="font-normal text-ink-muted">Optional</span>
                </label>
                <textarea
                  id="requirements"
                  rows={3}
                  maxLength={1000}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  placeholder="Tell us anything else your caregiver should know…"
                  className="ml-7 rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
                />
              </section>
            )}

            {/* 5. ESTIMATED COST — informational only, never what actually
              gets charged. The backend independently recomputes and
              charges this same figure at booking time; nothing here is
              ever trusted as the final amount, and submitting this form
              never charges the parent. */}
            {startTime && (
              <section className="flex flex-col gap-2 border-t border-[var(--color-lavender-border)] pt-6">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                  Estimated cost
                </h2>
                <div className="flex flex-col gap-1 rounded-[12px] border border-[var(--color-lavender-border)] bg-wisteria-tint p-4">
                  <p className="text-[12.5px] text-ink-muted">
                    {formatHours(priceDailyHours)} hrs/day × GH₵{hourlyRateFor(type)}/hr ×{" "}
                    {priceDays} day
                    {priceDays === 1 ? "" : "s"}
                    {priceChildCount > 1 ? ` × ${priceChildCount} children` : ""}
                  </p>
                  <p className="text-[19px] font-bold tabular-nums text-ink">
                    Total: GH₵{priceTotal}
                  </p>
                  {priceDailyHours < CARE_DAY_HOURS && (
                    <p className="text-[12px] text-ink-muted">
                      Your start time means each day runs {formatHours(priceDailyHours)} hours
                      instead of the standard {CARE_DAY_HOURS} — a session can&apos;t run past
                      midnight.
                    </p>
                  )}
                  <p className="text-[12px] text-ink-muted">
                    This is an estimate only — you won&apos;t be charged now. You&apos;ll pay once
                    you&apos;re matched with a caregiver. This is exactly what your caregiver will
                    see too.
                  </p>
                </div>
              </section>
            )}

            {formError && <p className="text-[13px] text-error">{formError}</p>}

            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="submit"
                size="lg"
                disabled={wards === null || wards.length === 0 || !canFindCare || submitting}
                className="w-full justify-center"
              >
                {submitting ? "Finding your caregiver…" : "Find Care"}
              </Button>
              <p className="text-[12px] text-ink-muted">
                We&apos;ll match you with a CareLink caregiver who fits your request.
              </p>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}
