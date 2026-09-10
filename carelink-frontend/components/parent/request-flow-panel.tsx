"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowSquareOut, Check, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { calculateTotalAmount, hourlyRateFor } from "@carelink/shared";
import { Sheet } from "@/components/ui/sheet";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { RatingStars } from "@/components/ui/rating-stars";
import { VerificationBadge } from "@/components/ui/badge";
import { LocationPicker, type ResolvedLocation } from "@/components/location-picker";
import { AddWardForm } from "@/components/parent/add-ward-form";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { caregiverPhotoUrl } from "@/lib/photo-url";
import { suggestedSkillForAge, type SearchFilters, type Ward } from "@/components/find-care/types";

type CaregiverType = "nanny" | "babysitter";

// The parent's required pick of one specific caregiver — CareLink no
// longer auto-selects one. Real eligibility (date/time, service area) is
// always checked server-side when dispatch actually runs
// (lib/services/dispatch.ts's existing preferred-caregiver path);
// appearing in this list is never a guarantee. Reuses the existing
// GET /api/search/caregivers results (same data Find Care shows, now
// with real lat/lng so it's genuinely proximity-sorted) — every real
// caregiver near the location, Nanny and (historically) Babysitter
// alike, since CareLink no longer asks a parent to choose a type before
// searching. `caregiver_type` is still whatever real value is on file
// for that caregiver (needed only so the request submits with a value
// the backend's existing validation already understands) — it's never
// shown or asked about here.
type PreferredCandidate = {
  staff_profile_id: string;
  full_name: string;
  caregiver_type: "nanny" | "babysitter" | null;
  // Shown on the pick card and linked to the full profile
  // (/parent/caregivers/[id]) — all straight from GET /api/search/caregivers.
  photo_path?: string | null;
  rating_avg?: number | null;
  rating_count?: number;
  years_experience?: number | null;
  verification_status?: string;
  verification_method?: "carelink" | "agency" | null;
  bio?: string | null;
  areas?: { area: string; isPrimary: boolean }[];
};

// Two real screens, not one — "Find Care" only ever validates and
// submits the request *details*; picking who it's sent to is a second,
// later step, once CareLink actually knows who's nearby and available.
type FlowStep = "form" | "results";

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

// Nanny and Babysitter are merged into one "Nanny" concept for parents
// — this heading is always "Nanny" regardless of the real, historical
// `type` value a restored request might carry (see the `type` prop
// below), so a parent retrying an old request never sees "Babysitter"
// resurface.
const HEADING = "Nanny";

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
  // initial?.days ("N days a week", a frequency) is a different unit
  // than duration ("N hours") and is deliberately not reused here — only
  // a genuine hour count prefills this.
  const [duration, setDuration] = useState(() => {
    if (restoreFrom) return String(hoursBetween(restoreFrom.startTime, restoreFrom.endTime));
    return initial?.hours ?? "4";
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

  const [step, setStep] = useState<FlowStep>("form");
  // Set only once a card in the results list is actually clicked — while
  // non-null and `submitting` is true, it's who the request is currently
  // being sent to (drives the per-card "Sending…" state below).
  const [preferredCaregiver, setPreferredCaregiver] = useState<PreferredCandidate | null>(null);
  const [preferredCandidates, setPreferredCandidates] = useState<PreferredCandidate[] | null>(null);
  const [preferredSearch, setPreferredSearch] = useState("");

  // "Ask Nia to help me pick" — only ever a suggestion the parent still
  // acts on themselves. Nia recommends one caregiver from exactly the
  // list on screen (POST /api/care-assistant/recommend-caregiver).
  const [niaOpen, setNiaOpen] = useState(false);
  const [niaMessage, setNiaMessage] = useState("");
  const [niaLoading, setNiaLoading] = useState(false);
  const [niaError, setNiaError] = useState<string | null>(null);
  const [niaPick, setNiaPick] = useState<{ staffProfileId: string; reason: string } | null>(null);

  async function askNia() {
    const text = niaMessage.trim();
    if (!text || niaLoading || !preferredCandidates) return;
    setNiaLoading(true);
    setNiaError(null);
    setNiaPick(null);
    try {
      const res = await apiFetch<{ staffProfileId: string; reason: string }>(
        "/api/care-assistant/recommend-caregiver",
        {
          method: "POST",
          body: {
            message: text,
            candidates: preferredCandidates.slice(0, 10).map((c) => ({
              staffProfileId: c.staff_profile_id,
              fullName: c.full_name,
              yearsExperience: c.years_experience ?? null,
              ratingAvg: c.rating_avg ?? null,
              ratingCount: c.rating_count ?? 0,
              bio: c.bio ?? null,
              skills: [] as string[],
              primaryArea: c.areas?.find((a) => a.isPrimary)?.area ?? c.areas?.[0]?.area ?? null,
            })),
          },
        },
      );
      setNiaPick(res);
    } catch (err) {
      setNiaError(errorMessage(err));
    } finally {
      setNiaLoading(false);
    }
  }

  // "Find Care": validates every request-detail field, then fetches the
  // real, eligible, nearby caregiver list and moves to the results
  // screen — never submits the actual request itself. Mirrors
  // chooseCaregiver's own required-field checks below, just surfaced
  // before the click instead of after it.
  function onFindCare(e: React.FormEvent) {
    e.preventDefault();
    if (wardIds.length === 0) {
      setFormError("Choose which child (or children) this request is for.");
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
    if (!startDate) {
      setFormError("Choose a date to continue.");
      return;
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
    setStep("results");
    setPreferredCandidates(null); // re-fetch every time — proximity depends on location, which can change
    setNiaPick(null);
    setNiaError(null);
    const params = new URLSearchParams();
    // Only real coordinates are sent — never the coarse area string.
    // The area string was an exact-match hard filter (a caregiver whose
    // service area didn't spell the parent's suburb identically was
    // dropped entirely); this flow instead shows every eligible
    // caregiver and lets the coordinates sort them by real distance
    // (computeProximityFit in lib/services/matching.ts). A parent picks
    // one regardless of how their typed areas happen to be worded.
    params.set("latitude", String(location.latitude));
    params.set("longitude", String(location.longitude));
    // The requested window + availability=conflicts: the list still
    // shows everyone, minus anyone already on a booking that clashes
    // with this time (or mid-session) — never anyone just because it's
    // outside their usual weekly hours.
    params.set("date", startDate);
    params.set("startTime", startTime);
    params.set("endTime", addHours(startTime, Number(duration)));
    params.set("availability", "conflicts");
    apiFetch<{ results: PreferredCandidate[] }>(`/api/search/caregivers?${params.toString()}`)
      // Every real, eligible caregiver the search returns — no client-
      // side filtering by type at all. CareLink no longer asks the
      // parent to pick a type, and a caregiver with no type on file yet
      // is still shown (treated as a Nanny on submit, see chooseCaregiver).
      .then((res) => setPreferredCandidates(res.results))
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

  // Picking a caregiver off the results list *is* the real submit — the
  // request and lib/services/dispatch.ts's existing preferred-caregiver
  // path (offer to this one caregiver first, pause rather than
  // auto-advance if they decline) both fire the moment a card is
  // clicked. `location` is always resolved by the time this screen can
  // even be reached (onFindCare above won't move past step "form"
  // otherwise).
  async function chooseCaregiver(c: PreferredCandidate) {
    if (submitting || !location) return;
    setPreferredCaregiver(c);
    setFormError(null);
    setSubmitting(true);

    try {
      const endTime = addHours(startTime, Number(duration));
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
          preferredStaffProfileId: c.staff_profile_id,
          source: "direct",
          // The chosen caregiver's own real type — never a value the
          // parent picked, since they never see this distinction. A
          // caregiver with no type on file yet defaults to "nanny"
          // (every caregiver is a Nanny to parents now). The backend's
          // preferred-caregiver-type check (app/api/care-requests/
          // route.ts) allows a null-typed preferred caregiver through.
          caregiverType: c.caregiver_type ?? "nanny",
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
          notes: requirements.trim() || undefined,
        },
      });
      await apiFetch(`/api/care-requests/${res.careRequest.id}/dispatch/start`, { method: "POST" });
      router.push(`/parent/care-requests/${res.careRequest.id}`);
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
      setPreferredCaregiver(null);
    }
  }

  // CareLink's finalized fixed-rate model: this is informational only —
  // exactly the formula the backend independently recomputes and
  // charges from (POST /api/care-requests, never trusting this figure).
  // Every request is a single session; the regular rate is charged once
  // per child. Hidden until there's a real, positive duration to price.
  const priceDurationHours = Number(duration);
  const priceChildCount = Math.max(1, wardIds.length);
  const priceTotal =
    priceDurationHours > 0
      ? calculateTotalAmount(type, priceDurationHours, 1, priceChildCount)
      : null;

  // Find Care stays disabled until every field the backend will actually
  // require is genuinely filled in — mirrors onFindCare's own checks
  // above, just surfaced before the click instead of after it. Choosing
  // a caregiver happens on the next screen, so it's not part of this
  // check.
  const hasCareNeed = requirementChips.size > 0 || (showOther && Boolean(requirements.trim()));
  const canFindCare =
    wardIds.length > 0 &&
    Boolean(startTime) &&
    Boolean(duration) &&
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

      {/* TITLE */}
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-[26px] font-bold font-heading text-ink">Request a {HEADING}</h1>
        <p className="text-[14px] text-ink-muted">
          Tell us what you need and we&apos;ll find an eligible agency {HEADING.toLowerCase()} near
          your care location.
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
              setWardIds((prev) => (prev.includes(w.id) ? prev : [...prev, w.id]));
              setAddingWard(false);
            }}
            onCancel={() => setAddingWard(false)}
          />
        ) : step === "results" ? (
          <Sheet className="flex flex-col gap-5 border-[var(--color-lavender-border)]">
            <button
              type="button"
              onClick={() => setStep("form")}
              className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} /> Edit request details
            </button>

            <div>
              <h2 className="text-[19px] font-semibold font-heading text-ink">
                Choose a caregiver
              </h2>
              <p className="text-[13px] text-ink-muted">
                Verified {HEADING.toLowerCase()}s who can serve your area, closest first. CareLink
                will send your request to the one you choose — if they&apos;re unavailable, you can
                come back and try someone else.
              </p>
            </div>

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

            {/* ASK NIA TO HELP PICK — advice only; the parent still
              presses Request on whoever they choose. Nia only ever
              recommends someone from this exact on-screen list. */}
            {filteredPreferredCandidates.length > 1 && (
              <div className="rounded-[12px] border border-[var(--color-lavender-border)] bg-wisteria-tint p-3">
                {!niaOpen ? (
                  <button
                    type="button"
                    onClick={() => setNiaOpen(true)}
                    className="text-[13px] font-semibold text-wisteria hover:text-wisteria-hover"
                  >
                    Not sure who to pick? Ask Nia →
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12.5px] font-semibold text-ink">
                      Tell Nia what matters to you and she&apos;ll suggest one of the caregivers
                      above.
                    </p>
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={niaMessage}
                      onChange={(e) => setNiaMessage(e.target.value)}
                      placeholder="e.g. My son is 1 and shy — I'd like someone gentle with lots of infant experience"
                      className="rounded-[10px] border border-[var(--color-lavender-border)] bg-sheet px-3 py-2 text-[13.5px] text-ink placeholder:text-ink-muted focus:border-wisteria focus:outline-none focus:ring-4 focus:ring-wisteria/15"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => void askNia()}
                        disabled={niaLoading || !niaMessage.trim()}
                      >
                        {niaLoading ? "Nia is thinking…" : "Ask Nia"}
                      </Button>
                      <button
                        type="button"
                        onClick={() => {
                          setNiaOpen(false);
                          setNiaError(null);
                        }}
                        className="text-[13px] font-semibold text-ink-muted hover:text-ink"
                      >
                        Close
                      </button>
                    </div>
                    {niaError && <p className="text-[13px] text-error">{niaError}</p>}
                    {niaPick && (
                      <p className="rounded-[10px] bg-sheet px-3 py-2 text-[13px] text-ink">
                        <span className="font-semibold text-wisteria">Nia suggests: </span>
                        {niaPick.reason}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {preferredCandidates === null && (
              <p className="text-[13px] text-ink-muted">Loading caregivers near you…</p>
            )}
            {preferredCandidates !== null && filteredPreferredCandidates.length === 0 && (
              <p className="text-[13px] text-ink-muted">
                {preferredSearch.trim()
                  ? `No ${HEADING.toLowerCase()}s match “${preferredSearch.trim()}”.`
                  : `No verified ${HEADING.toLowerCase()}s are available right now. Please check back later.`}
              </p>
            )}
            {filteredPreferredCandidates.length > 0 && (
              <div className="flex flex-col gap-3">
                {filteredPreferredCandidates.map((c) => {
                  const sendingThisOne =
                    submitting && preferredCaregiver?.staff_profile_id === c.staff_profile_id;
                  const primaryArea =
                    c.areas?.find((a) => a.isPrimary)?.area ?? c.areas?.[0]?.area ?? null;
                  const isNiaPick = niaPick?.staffProfileId === c.staff_profile_id;
                  return (
                    <div
                      key={c.staff_profile_id}
                      className={`flex flex-col gap-3 rounded-[12px] border p-3 ${
                        isNiaPick
                          ? "border-wisteria bg-wisteria-tint"
                          : "border-[var(--color-lavender-border)]"
                      }`}
                    >
                      {isNiaPick && (
                        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-wisteria">
                          Nia&apos;s suggestion
                        </p>
                      )}
                      <div className="flex items-start gap-3">
                        <Avatar
                          photoUrl={caregiverPhotoUrl(c.photo_path ?? null)}
                          name={c.full_name}
                          size="sm"
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[14px] font-semibold text-ink">{c.full_name}</p>
                            {c.verification_status === "verified" && (
                              <VerificationBadge method={c.verification_method} />
                            )}
                          </div>
                          <RatingStars rating={c.rating_avg ?? null} reviewCount={c.rating_count} />
                          <p className="text-[12px] text-ink-muted">
                            {c.years_experience != null
                              ? `${c.years_experience} yrs experience`
                              : ""}
                            {c.years_experience != null && primaryArea ? " · " : ""}
                            {primaryArea ?? ""}
                          </p>
                        </div>
                      </div>
                      {c.bio && (
                        <p className="line-clamp-2 text-[12.5px] leading-relaxed text-ink-muted">
                          {c.bio}
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          disabled={submitting}
                          onClick={() => void chooseCaregiver(c)}
                          className="flex-1 justify-center"
                        >
                          {sendingThisOne ? "Sending…" : "Request"}
                        </Button>
                        <Link
                          href={`/parent/caregivers/${c.staff_profile_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 rounded-[10px] border border-[var(--color-lavender-border)] px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-wisteria hover:text-wisteria"
                        >
                          View profile <ArrowSquareOut size={13} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {formError && <p className="text-[13px] text-error">{formError}</p>}
          </Sheet>
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
                  label="Duration"
                  value={duration}
                  onChange={setDuration}
                  options={DURATION_OPTIONS}
                />
              </div>
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
            {startTime && priceTotal !== null && (
              <section className="flex flex-col gap-2 border-t border-[var(--color-lavender-border)] pt-6">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink">
                  Estimated cost
                </h2>
                <div className="flex flex-col gap-1 rounded-[12px] border border-[var(--color-lavender-border)] bg-wisteria-tint p-4">
                  <p className="text-[12.5px] text-ink-muted">
                    {priceDurationHours} hour{priceDurationHours === 1 ? "" : "s"} × GH₵
                    {hourlyRateFor(type)}/hour
                    {priceChildCount > 1 ? ` × ${priceChildCount} children` : ""}
                  </p>
                  <p className="text-[19px] font-bold tabular-nums text-ink">
                    Total: GH₵{priceTotal}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    This is an estimate only — you won&apos;t be charged now. You&apos;ll pay once
                    your chosen caregiver accepts your request.
                  </p>
                </div>
              </section>
            )}

            {formError && <p className="text-[13px] text-error">{formError}</p>}

            <div className="flex flex-col items-center gap-1.5">
              <Button
                type="submit"
                size="lg"
                disabled={wards === null || wards.length === 0 || !canFindCare}
                className="w-full justify-center"
              >
                Find Care
              </Button>
              <p className="text-[12px] text-ink-muted">
                We&apos;ll show you verified caregivers near you to choose from.
              </p>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}
