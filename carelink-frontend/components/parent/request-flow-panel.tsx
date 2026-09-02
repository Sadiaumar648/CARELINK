"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
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

const COPY: Record<
  CaregiverType,
  {
    heading: string;
    image: string;
    imageAlt: string;
    hoursOrDays: "days" | "hours";
    button: string;
  }
> = {
  nanny: {
    heading: "Nanny",
    image: "/demo/hero-reading.jpeg",
    imageAlt: "A nanny reading with a child",
    hoursOrDays: "days",
    button: "Find Nannies",
  },
  babysitter: {
    heading: "Babysitter",
    image: "/demo/ward-activity.jpeg",
    imageAlt: "A babysitter playing with a child",
    hoursOrDays: "hours",
    button: "Find Babysitters",
  },
};

const SCHEDULE_OPTIONS = [
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

const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  value: String(n),
  label: `${n} day${n === 1 ? "" : "s"} a week`,
}));

const HOURS_OPTIONS = [1, 2, 3, 4, 6, 8].map((n) => ({
  value: String(n),
  label: `${n} hour${n === 1 ? "" : "s"}`,
}));

const AGE_OPTIONS = [
  { value: "0", label: "Newborn (0–11 months)" },
  { value: "2", label: "Infant (1–2 years)" },
  { value: "4", label: "Toddler (3–4 years)" },
  { value: "6", label: "School-age (5+ years)" },
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
  placeholder: string;
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
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// hh:mm + N hours → hh:mm, capped so it never crosses midnight (matches
// the same 23:45 ceiling the backend's own "overnight" window uses).
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
}: {
  type: CaregiverType;
  onBack: () => void;
  initial?: RequestFlowInitial;
}) {
  const router = useRouter();
  const copy = COPY[type];
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [schedule, setSchedule] = useState(initial?.schedule ?? "");
  const [daysOrHours, setDaysOrHours] = useState(
    (type === "nanny" ? initial?.days : initial?.hours) ?? "",
  );
  const [area, setArea] = useState(initial?.area ?? "");
  const [age, setAge] = useState(initial?.age ?? "");
  const [requirements, setRequirements] = useState(initial?.requirements ?? "");
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [wardId, setWardId] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch(() => setWards([]));
  }, []);

  // A best-effort default by stated age — never auto-picked without a
  // real ward existing, and the parent can always change it.
  useEffect(() => {
    if (!wards || wardId) return;
    const suggested =
      wards.length === 1
        ? wards[0].id
        : (wards.find((w) => String(w.age_years) === age)?.id ?? null);
    if (!suggested) return;
    void Promise.resolve().then(() => setWardId(suggested));
  }, [wards, age, wardId]);

  // Every dispatched request goes to an eligible caregiver who then
  // holds a real booking for a real child — the same invariant every
  // other booking in this app already has (createBookingRequestSchema
  // requires a wardId) — so this form now requires one too, the same
  // way CareLink AI's confirmation card already does.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!startDate || !schedule) {
      setFormError("Choose a start date and a schedule to continue.");
      return;
    }
    // CareLink's strict rule: no location, no caregiver search — enforced
    // here and again by the backend (POST /api/care-requests requires it).
    if (!area.trim()) {
      setFormError("Add a care location so we can find caregivers who serve your area.");
      return;
    }
    if (!wardId) {
      setFormError("Choose which child this request is for.");
      return;
    }
    setFormError(null);
    setSubmitting(true);

    try {
      const scheduleOption = SCHEDULE_OPTIONS.find((s) => s.value === schedule)!;
      const startTime = scheduleOption.startTime;
      const endTime =
        type === "babysitter" && daysOrHours
          ? addHours(scheduleOption.startTime, Number(daysOrHours))
          : scheduleOption.endTime;

      // Everything here is already known exactly, so it's built directly
      // — no need to round-trip it through the AI parser.
      const filters: SearchFilters = { date: startDate, startTime, endTime };
      filters.area = area.trim();
      if (age) filters.skills = [suggestedSkillForAge(Number(age))];

      // Only the genuinely free-text field goes through the existing AI
      // parser — and only if the parent actually wrote something — and
      // only ever adds to what's already known, never overrides it.
      if (requirements.trim()) {
        try {
          const res = await apiFetch<{ filters: Partial<SearchFilters> | null }>(
            "/api/search/parse",
            {
              method: "POST",
              body: {
                query: `Looking for a ${copy.heading.toLowerCase()} in ${area.trim() || "any area"}. ${requirements.trim()}`,
              },
            },
          );
          if (res.filters?.skills?.length) {
            const merged = new Set([...(filters.skills ?? []), ...res.filters.skills]);
            filters.skills = Array.from(merged);
          }
          if (res.filters?.budgetCeiling && !filters.budgetCeiling) {
            filters.budgetCeiling = res.filters.budgetCeiling;
          }
          if (res.filters?.minExperience && !filters.minExperience) {
            filters.minExperience = res.filters.minExperience;
          }
        } catch {
          // AI parsing is best-effort — a parent's search is never
          // blocked by it, same convention as the rest of the app.
        }
      }

      // The structured request now drives the outcome — CareLink
      // dispatches it to eligible caregivers one at a time, the same
      // experience as the AI-assisted path, not just a browse-and-pick
      // results page.
      const res = await apiFetch<{ careRequest: { id: string } }>("/api/care-requests", {
        method: "POST",
        body: {
          wardId,
          source: "direct",
          caregiverType: type,
          date: filters.date,
          startTime: filters.startTime,
          endTime: filters.endTime,
          location: filters.area,
          skills: filters.skills,
          notes: requirements.trim() || undefined,
        },
      });
      await apiFetch(`/api/care-requests/${res.careRequest.id}/dispatch/start`, { method: "POST" });
      router.push(`/parent/care-requests/${res.careRequest.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <Sheet className="mx-auto flex w-full max-w-[440px] flex-col gap-5 border-[var(--color-lavender-border)]">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <h1 className="text-[22px] font-semibold font-heading text-ink">
        I need a <span className="text-wisteria">{copy.heading}</span>
      </h1>

      <div className="relative aspect-[5/2] w-full overflow-hidden rounded-[14px]">
        <Image src={copy.image} alt={copy.imageAlt} fill sizes="480px" className="object-cover" />
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-ink">Tell us what you need</h2>
        <p className="text-[13px] text-ink-muted">
          Please provide a few details so we can find the perfect {copy.heading.toLowerCase()} for
          your family.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {wards && wards.length > 0 ? (
            <SelectField
              label="Which child?"
              value={wardId}
              onChange={setWardId}
              options={wards.map((w) => ({
                value: w.id,
                label: `${w.display_name} (${w.age_years})`,
              }))}
              placeholder="Choose a child"
            />
          ) : (
            wards && (
              <p className="text-[12.5px] text-error sm:col-span-2">
                Add a child under My Wards before requesting care.
              </p>
            )
          )}
          <Field
            label="Start date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
          />
          <SelectField
            label="Schedule"
            value={schedule}
            onChange={setSchedule}
            options={SCHEDULE_OPTIONS.map(({ value, label }) => ({ value, label }))}
            placeholder="Select time"
          />
          <SelectField
            label={type === "nanny" ? "How many days per week?" : "How many hours?"}
            value={daysOrHours}
            onChange={setDaysOrHours}
            options={type === "nanny" ? DAYS_OPTIONS : HOURS_OPTIONS}
            placeholder="Select"
          />
          <Field
            label="Location / Area"
            placeholder="Enter your area"
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
          />
          <SelectField
            label="Child's age"
            value={age}
            onChange={setAge}
            options={AGE_OPTIONS}
            placeholder="Select age"
          />
          <Field
            label="Any special requirements?"
            placeholder="e.g. food allergies, experience with infants…"
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            className="border-[var(--color-lavender-border)] focus:border-wisteria focus:ring-wisteria/15"
          />
        </div>

        {formError && <p className="text-[13px] text-error">{formError}</p>}

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={submitting || wards === null || wards.length === 0}
          className="w-full"
        >
          {submitting ? "Searching…" : copy.button}
        </Button>
      </form>
    </Sheet>
  );
}
