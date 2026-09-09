"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CaretRight, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import {
  calculateTotalAmount,
  countOccurrences,
  firstMatchingDate,
  hourlyRateFor,
  sessionCountFor,
  type RepeatMode,
  type Weekday,
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

// A parent's optional pick of one specific caregiver to try first —
// real eligibility (type, date/time, service area) is always checked
// server-side when dispatch actually runs (lib/services/dispatch.ts);
// this is never a guarantee. Reuses the existing GET /api/search/
// caregivers results (same data Find Care shows), filtered client-side
// to this request's caregiver type — no new search endpoint.
type PreferredCandidate = { staff_profile_id: string; full_name: string; caregiver_type: string };

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
  date: string;
  startTime: string;
  endTime: string;
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

// The restored duration is derived from the two real timestamps rather
// than stored separately — rounded defensively, though every duration
// this form itself ever sends is already a whole number of hours.
function hoursBetween(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.slice(0, 5).split(":").map(Number);
  const [eh, em] = endTime.slice(0, 5).split(":").map(Number);
  return Math.round((eh * 60 + em - (sh * 60 + sm)) / 60);
}

const COPY: Record<CaregiverType, { heading: string }> = {
  nanny: { heading: "Nanny" },
  babysitter: { heading: "Babysitter" },
};

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

const DURATION_OPTIONS = [1, 2, 3, 4, 6, 8].map((n) => ({
  value: String(n),
  label: `${n} hour${n === 1 ? "" : "s"}`,
}));

const REPEAT_OPTIONS = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom schedule" },
];

const DAYS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
] as const;

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

// hh:mm + N hours → hh:mm, capped so it never crosses midnight.
function addHours(time: string, hours: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMinutes = Math.min(h * 60 + m + hours * 60, 23 * 60 + 45);
  const endH = Math.floor(totalMinutes / 60);
  const endM = totalMinutes % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

export function RequestFlowPanel({
  type,
  onBack,
  initial,
  restoreFrom,
}: {
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
  const copy = COPY[type];
  const [startDate, setStartDate] = useState(() => {
    if (restoreFrom) return restoreFrom.repeatMode === "once" ? restoreFrom.date : "";
    return initial?.startDate ?? "";
  });
  const [startTime, setStartTime] = useState(() => {
    if (restoreFrom) return restoreFrom.startTime.slice(0, 5);
    const matched = SCHEDULE_OPTIONS.find((s) => s.value === initial?.schedule);
    return matched?.startTime ?? "";
  });
  // initial?.days ("N days a week", a frequency) is a different unit
  // than duration ("N hours") and is deliberately not reused here — only
  // a genuine hour count prefills this.
  const [duration, setDuration] = useState(() => {
    if (restoreFrom) return String(hoursBetween(restoreFrom.startTime, restoreFrom.endTime));
    return initial?.hours ?? "4";
  });
  const [repeat, setRepeat] = useState<string>(() => restoreFrom?.repeatMode ?? "once");
  // Weekly: exactly one selected day. Custom: any number of selected
  // days. Kept as separate state (not shared) so switching between the
  // two never silently carries a selection over in a way that could
  // misrepresent what the parent actually chose.
  const [weeklyDay, setWeeklyDay] = useState(() =>
    restoreFrom?.repeatMode === "weekly" ? (restoreFrom.repeatWeekdays[0] ?? "") : "",
  );
  const [customDays, setCustomDays] = useState<Set<string>>(
    () => new Set(restoreFrom?.repeatMode === "custom" ? restoreFrom.repeatWeekdays : []),
  );
  const [rangeStart, setRangeStart] = useState(() => restoreFrom?.repeatStartDate ?? "");
  const [rangeEnd, setRangeEnd] = useState(() => restoreFrom?.repeatEndDate ?? "");
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
  const [wardId, setWardId] = useState(() => restoreFrom?.wardId ?? "");
  const [changingWard, setChangingWard] = useState(false);
  // Adding a child from here never navigates away — it shows the same
  // real Add Child form inline (components/parent/add-ward-form.tsx),
  // so nothing already filled in on this request is ever lost. Settings
  // → Ward Profiles reuses the exact same component for the same reason
  // it should behave identically there.
  const [addingWard, setAddingWard] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [preferredCaregiver, setPreferredCaregiver] = useState<PreferredCandidate | null>(null);
  const [preferredPickerOpen, setPreferredPickerOpen] = useState(false);
  const [preferredCandidates, setPreferredCandidates] = useState<PreferredCandidate[] | null>(null);
  const [preferredSearch, setPreferredSearch] = useState("");

  function openPreferredPicker() {
    setPreferredPickerOpen(true);
    if (preferredCandidates !== null) return;
    const params = new URLSearchParams();
    const area = location?.coarseArea ?? location?.formattedAddress;
    if (area) params.set("area", area);
    apiFetch<{ results: PreferredCandidate[] }>(`/api/search/caregivers?${params.toString()}`)
      .then((res) => setPreferredCandidates(res.results.filter((c) => c.caregiver_type === type)))
      .catch(() => setPreferredCandidates([]));
  }

  const filteredPreferredCandidates = (preferredCandidates ?? []).filter((c) =>
    c.full_name.toLowerCase().includes(preferredSearch.trim().toLowerCase()),
  );

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch(() => setWards([]));
  }, []);

  const selectedWard = wards?.find((w) => w.id === wardId) ?? null;

  // A best-effort default (single child, or a match against the age the
  // AI already gathered on a round trip) — never auto-picked without a
  // real ward existing, and the parent can always change it.
  useEffect(() => {
    if (!wards || wardId) return;
    const suggested =
      wards.length === 1
        ? wards[0].id
        : (wards.find((w) => String(w.age_years) === initial?.age)?.id ?? null);
    if (!suggested) return;
    void Promise.resolve().then(() => setWardId(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial is a one-time prefill, not a live dependency
  }, [wards, wardId]);

  // Pre-check the age-appropriate chip once a child is known — visible,
  // adjustable, never hidden magic: the chip state itself is what gets
  // submitted, not a silent extra filter.
  useEffect(() => {
    if (!selectedWard) return;
    const suggested = suggestedSkillForAge(selectedWard.age_years);
    void Promise.resolve().then(() => {
      setRequirementChips((prev) => (prev.has(suggested) ? prev : new Set(prev).add(suggested)));
    });
  }, [selectedWard]);

  function toggleCustomDay(value: string) {
    setCustomDays((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function toggleChip(value: string) {
    setRequirementChips((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!wardId) {
      setFormError("Choose which child this request is for.");
      return;
    }
    if (!startTime) {
      setFormError("Choose a start time to continue.");
      return;
    }
    if (requirementChips.size === 0 && !(showOther && requirements.trim())) {
      setFormError("Choose at least one care need.");
      return;
    }

    // Each Repeat mode validates and resolves its own real occurrence
    // date differently — Once uses the date the parent typed directly;
    // Weekly/Custom resolve the first real calendar date matching the
    // chosen day(s) on or after the selected start date. Dispatch and
    // matching still only ever see one real date/time window per
    // request (bookings remain single-session — see the notes text
    // below), exactly as before; what's new is that date is now
    // actually consistent with the pattern the parent picked, not
    // arbitrary.
    let effectiveDate: string;
    let selectedWeekdays: Weekday[] = [];
    if (repeat === "once") {
      if (!startDate) {
        setFormError("Choose a date to continue.");
        return;
      }
      effectiveDate = startDate;
    } else if (repeat === "weekly") {
      if (!weeklyDay) {
        setFormError("Choose which day of the week you need care.");
        return;
      }
      if (!rangeStart || !rangeEnd) {
        setFormError("Choose a start date and end date for this weekly schedule.");
        return;
      }
      if (rangeEnd < rangeStart) {
        setFormError("End date can't be before the start date.");
        return;
      }
      selectedWeekdays = [weeklyDay as Weekday];
      effectiveDate = firstMatchingDate(rangeStart, selectedWeekdays) ?? rangeStart;
    } else {
      if (customDays.size === 0) {
        setFormError("Choose at least one day you need care.");
        return;
      }
      if (!rangeStart || !rangeEnd) {
        setFormError("Choose a start date and end date for this schedule.");
        return;
      }
      if (rangeEnd < rangeStart) {
        setFormError("End date can't be before the start date.");
        return;
      }
      selectedWeekdays = Array.from(customDays) as Weekday[];
      effectiveDate = firstMatchingDate(rangeStart, selectedWeekdays) ?? rangeStart;
    }

    // CareLink's strict rule: no valid, map-resolved location, no
    // caregiver search — enforced here and again by the backend
    // (POST /api/care-requests requires the real coordinates, not just
    // a non-empty string).
    if (!location) {
      setFormError(
        "Where will care take place? Please provide an exact GPS location so we can find caregivers who can serve you.",
      );
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const endTime = addHours(startTime, Number(duration));
      // The coarse area — never the full address — is what still feeds
      // the existing area-string search/dispatch filters, exactly as a
      // typed area name did before.
      const searchArea = location.coarseArea ?? location.formattedAddress;
      const filters: SearchFilters = { date: effectiveDate, startTime, endTime, area: searchArea };
      if (requirementChips.size > 0) filters.skills = Array.from(requirementChips);

      const notesParts: string[] = [];
      if (requirements.trim()) notesParts.push(requirements.trim());
      if (repeat !== "once") {
        const dayLabels = selectedWeekdays
          .map((w) => DAYS.find((d) => d.value === w)?.label ?? w)
          .join(", ");
        const occurrences = countOccurrences(rangeStart, rangeEnd, selectedWeekdays);
        const formatRangeDate = (iso: string) =>
          new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
        notesParts.push(
          `Repeats: every ${dayLabels}, ${formatRangeDate(rangeStart)}–${formatRangeDate(rangeEnd)} ` +
            `(${occurrences} session${occurrences === 1 ? "" : "s"}). ` +
            `CareLink bookings are single-session today — this request covers the first session ` +
            `(${formatRangeDate(effectiveDate)}); please confirm the remaining sessions separately.`,
        );
      }

      const res = await apiFetch<{ careRequest: { id: string } }>("/api/care-requests", {
        method: "POST",
        body: {
          wardId,
          preferredStaffProfileId: preferredCaregiver?.staff_profile_id,
          source: "direct",
          caregiverType: type,
          date: filters.date,
          startTime: filters.startTime,
          endTime: filters.endTime,
          location: searchArea,
          serviceAddress: location.formattedAddress,
          serviceLatitude: location.latitude,
          serviceLongitude: location.longitude,
          locationPlaceId: location.placeId ?? undefined,
          locationSource: location.source,
          locationResolved: true,
          skills: filters.skills,
          notes: notesParts.join(" ") || undefined,
          repeatMode: repeat as RepeatMode,
          repeatWeekdays: selectedWeekdays,
          repeatStartDate: repeat === "once" ? undefined : rangeStart,
          repeatEndDate: repeat === "once" ? undefined : rangeEnd,
        },
      });
      await apiFetch(`/api/care-requests/${res.careRequest.id}/dispatch/start`, { method: "POST" });
      router.push(`/parent/care-requests/${res.careRequest.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  // CareLink's finalized fixed-rate model: this is informational only —
  // exactly the formula the backend independently recomputes and
  // charges from (POST /api/care-requests, never trusting this figure).
  // Once = 1 session; Weekly/Custom count real matching calendar dates,
  // same as the "This will repeat…" preview above. Hidden until there's
  // a real, positive session count to price.
  const priceWeekdays = (
    repeat === "weekly" ? (weeklyDay ? [weeklyDay] : []) : Array.from(customDays)
  ) as Weekday[];
  const priceSessionCount = sessionCountFor(
    repeat as RepeatMode,
    priceWeekdays,
    rangeStart,
    rangeEnd,
  );
  const priceDurationHours = Number(duration);
  const priceTotal =
    priceSessionCount > 0 && priceDurationHours > 0
      ? calculateTotalAmount(type, priceDurationHours, priceSessionCount)
      : null;

  // Find Care stays disabled until every field the backend will actually
  // require is genuinely filled in — mirrors onSubmit's own checks above,
  // just surfaced before the click instead of after it.
  const hasValidSchedule =
    repeat === "once"
      ? Boolean(startDate)
      : repeat === "weekly"
        ? Boolean(weeklyDay) && Boolean(rangeStart) && Boolean(rangeEnd) && rangeEnd >= rangeStart
        : customDays.size > 0 && Boolean(rangeStart) && Boolean(rangeEnd) && rangeEnd >= rangeStart;
  const hasCareNeed = requirementChips.size > 0 || (showOther && Boolean(requirements.trim()));
  const canSubmit =
    Boolean(wardId) &&
    Boolean(startTime) &&
    Boolean(duration) &&
    hasValidSchedule &&
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

      {/* TITLE */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[26px] font-bold font-heading text-ink">Request a {copy.heading}</h1>
        <p className="text-[14px] text-ink-muted">
          Tell us what you need and we&apos;ll find an eligible agency {copy.heading.toLowerCase()}{" "}
          near your care location.
        </p>
      </div>

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
              setWardId(w.id);
              setAddingWard(false);
            }}
            onCancel={() => setAddingWard(false)}
          />
        ) : (
          <Sheet
            as="form"
            onSubmit={onSubmit}
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

              {wards && wards.length > 0 && selectedWard && !changingWard && (
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-lavender-border)] p-3">
                  <div className="flex items-center gap-3">
                    <Avatar photoUrl={null} name={selectedWard.display_name} size="sm" />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">
                        {selectedWard.display_name}
                      </p>
                      <p className="text-[12.5px] text-ink-muted">Age {selectedWard.age_years}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChangingWard(true)}
                    className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                  >
                    Change
                  </button>
                </div>
              )}

              {wards && wards.length > 0 && (changingWard || !selectedWard) && (
                <div className="flex flex-col gap-2">
                  {wards.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => {
                        setWardId(w.id);
                        setChangingWard(false);
                      }}
                      className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-lavender-border)] p-3 text-left hover:border-wisteria"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar photoUrl={null} name={w.display_name} size="sm" />
                        <div>
                          <p className="text-[14px] font-semibold text-ink">{w.display_name}</p>
                          <p className="text-[12.5px] text-ink-muted">Age {w.age_years}</p>
                        </div>
                      </div>
                      <CaretRight size={16} className="text-ink-muted" />
                    </button>
                  ))}
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
                  label="Start time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
                />
                <SelectField
                  label="Duration"
                  value={duration}
                  onChange={setDuration}
                  options={DURATION_OPTIONS}
                />
                <div className={repeat === "once" ? "" : "sm:col-span-2"}>
                  <SelectField
                    label="Repeat"
                    value={repeat}
                    onChange={setRepeat}
                    options={REPEAT_OPTIONS}
                  />
                </div>
                {repeat === "once" && (
                  <Field
                    label="Date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
                  />
                )}
              </div>

              {/* Weekly = exactly one selected day, every week between the
                two dates. Custom schedule = any number of selected days,
                same date-range mechanic — the two modes share this range
                UI but never share which days are selected. */}
              {(repeat === "weekly" || repeat === "custom") && (
                <div className="flex flex-col gap-4 rounded-[12px] border border-[var(--color-lavender-border)] bg-paper p-4">
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-[13px] font-semibold text-ink">
                      {repeat === "weekly"
                        ? "Which day of the week?"
                        : "Which days do you need care?"}
                    </legend>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {DAYS.map((day) =>
                        repeat === "weekly" ? (
                          <label
                            key={day.value}
                            className="flex items-center gap-2 text-[13.5px] text-ink"
                          >
                            <input
                              type="radio"
                              name="weekly-day"
                              value={day.value}
                              checked={weeklyDay === day.value}
                              onChange={() => setWeeklyDay(day.value)}
                              className="h-4 w-4 accent-wisteria"
                            />
                            {day.label}
                          </label>
                        ) : (
                          <label
                            key={day.value}
                            className="flex items-center gap-2 text-[13.5px] text-ink"
                          >
                            <input
                              type="checkbox"
                              checked={customDays.has(day.value)}
                              onChange={() => toggleCustomDay(day.value)}
                              className="h-4 w-4 accent-wisteria"
                            />
                            {day.label}
                          </label>
                        ),
                      )}
                    </div>
                  </fieldset>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field
                      label="Start date"
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="border-[var(--color-lavender-border)] bg-sheet focus:border-wisteria focus:ring-wisteria/15"
                    />
                    <Field
                      label="End date"
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="border-[var(--color-lavender-border)] bg-sheet focus:border-wisteria focus:ring-wisteria/15"
                    />
                  </div>

                  {(() => {
                    const days = (
                      repeat === "weekly" ? (weeklyDay ? [weeklyDay] : []) : Array.from(customDays)
                    ) as Weekday[];
                    const occurrences = countOccurrences(rangeStart, rangeEnd, days);
                    if (occurrences === 0) return null;
                    return (
                      <p className="text-[12.5px] text-ink-muted">
                        This will repeat {occurrences} time{occurrences === 1 ? "" : "s"} between{" "}
                        {new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        and{" "}
                        {new Date(`${rangeEnd}T00:00:00`).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                        . CareLink bookings are single-session today — this request finds a
                        caregiver for the first session; you&apos;ll confirm the rest separately.
                      </p>
                    );
                  })()}
                </div>
              )}
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

            {/* PREFERRED CAREGIVER — optional. Real eligibility is only
              ever checked when dispatch actually runs (lib/services/
              dispatch.ts); nothing here is a promise. */}
            <section className="flex flex-col gap-3 border-t border-[var(--color-lavender-border)] pt-6">
              <div>
                <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                  Preferred caregiver{" "}
                  <span className="font-normal normal-case text-ink-muted">(optional)</span>
                </h2>
                <p className="text-[12px] text-ink-muted">
                  We&apos;ll try your preferred caregiver first. If they&apos;re unavailable, you
                  can ask CareLink to find another suitable caregiver.
                </p>
              </div>

              {preferredCaregiver ? (
                <div className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--color-lavender-border)] p-3">
                  <div className="flex items-center gap-3">
                    <Avatar photoUrl={null} name={preferredCaregiver.full_name} size="sm" />
                    <p className="text-[14px] font-semibold text-ink">
                      {preferredCaregiver.full_name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreferredCaregiver(null)}
                    className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                  >
                    Remove
                  </button>
                </div>
              ) : preferredPickerOpen ? (
                <div className="flex flex-col gap-3 rounded-[12px] border border-[var(--color-lavender-border)] p-3">
                  <div className="relative">
                    <MagnifyingGlass
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                    />
                    <input
                      value={preferredSearch}
                      onChange={(e) => setPreferredSearch(e.target.value)}
                      placeholder="Search by name"
                      className="w-full rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet py-2 pl-9 pr-3 text-[14px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
                    />
                  </div>
                  {preferredCandidates === null && (
                    <p className="text-[13px] text-ink-muted">Loading caregivers…</p>
                  )}
                  {preferredCandidates !== null && filteredPreferredCandidates.length === 0 && (
                    <p className="text-[13px] text-ink-muted">No matching caregivers found.</p>
                  )}
                  {filteredPreferredCandidates.length > 0 && (
                    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                      {filteredPreferredCandidates.map((c) => (
                        <button
                          key={c.staff_profile_id}
                          type="button"
                          onClick={() => {
                            setPreferredCaregiver(c);
                            setPreferredPickerOpen(false);
                          }}
                          className="flex items-center gap-3 rounded-[10px] p-2 text-left hover:bg-paper"
                        >
                          <Avatar photoUrl={null} name={c.full_name} size="sm" />
                          <p className="text-[14px] font-medium text-ink">{c.full_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreferredPickerOpen(false)}
                    className="flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-muted hover:text-ink"
                  >
                    <X size={14} /> Cancel
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={openPreferredPicker}
                  className="w-fit"
                >
                  Choose a preferred caregiver
                </Button>
              )}
            </section>

            {/* 5. ANYTHING ELSE */}
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
            {startTime && priceTotal !== null && (
              <section className="flex flex-col gap-2 border-t border-[var(--color-lavender-border)] pt-6">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                  Estimated cost
                </h2>
                <div className="flex flex-col gap-1 rounded-[12px] border border-[var(--color-lavender-border)] bg-wisteria-tint p-4">
                  <p className="text-[12.5px] text-ink-muted">
                    {priceSessionCount === 1
                      ? `${priceDurationHours} hour${priceDurationHours === 1 ? "" : "s"} × GH₵${hourlyRateFor(type)}/hour`
                      : `${priceSessionCount} sessions × ${priceDurationHours} hour${priceDurationHours === 1 ? "" : "s"} × GH₵${hourlyRateFor(type)}/hour`}
                  </p>
                  <p className="text-[19px] font-bold tabular-nums text-ink">
                    Total: GH₵{priceTotal}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    This is an estimate only — you won&apos;t be charged now. You&apos;ll pay once a
                    caregiver accepts your request.
                    {priceSessionCount > 1 &&
                      " CareLink bookings are single-session today — this request finds a caregiver for the first session; you'll confirm the rest separately."}
                  </p>
                </div>
              </section>
            )}

            {formError && <p className="text-[13px] text-error">{formError}</p>}

            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="submit"
                size="lg"
                disabled={submitting || wards === null || wards.length === 0 || !canSubmit}
                className="w-full justify-center"
              >
                {submitting ? "Starting your search…" : "Find Care"}
              </Button>
              <p className="text-[12px] text-ink-muted">
                We&apos;ll find an available, verified caregiver near you.
              </p>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}
