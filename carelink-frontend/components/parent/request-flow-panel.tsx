"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, MagnifyingGlass, Plus } from "@phosphor-icons/react";
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
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { NannyCard } from "@/components/parent/nanny-card";
import {
  CaregiverProfileView,
  type CaregiverProfile,
} from "@/components/parent/caregiver-profile-view";
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
  bookings_completed?: number;
  verification_status?: string;
  verification_method?: "carelink" | "agency" | null;
  bio?: string | null;
  areas?: { area: string; isPrimary: boolean }[];
};

// "form" collects the request details; "results" is the caregiver
// pick-list; "profile" is a read-only look at one caregiver from that
// list, with a Back that returns to the list exactly as it was.
type FlowStep = "form" | "results" | "profile";

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

  const [step, setStep] = useState<FlowStep>("form");
  const [preferredCandidates, setPreferredCandidates] = useState<PreferredCandidate[] | null>(null);
  const [preferredSearch, setPreferredSearch] = useState("");

  // "View profile" from the pick-list: an in-panel read-only look at one
  // caregiver, so "Back" returns to the list with everything intact
  // (never a navigation away that would drop the request in progress).
  const [profileCaregiver, setProfileCaregiver] = useState<CaregiverProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  function viewProfile(staffProfileId: string) {
    setProfileCaregiver(null);
    setProfileError(null);
    setStep("profile");
    apiFetch<{ caregiver: CaregiverProfile }>(`/api/caregivers/${staffProfileId}`)
      .then((res) => setProfileCaregiver(res.caregiver))
      .catch((err) => setProfileError(errorMessage(err)));
  }

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

  // The one nanny the parent just tapped "Request This Nanny" on — kept
  // only so that card can show its own "Sending…" state while the
  // request is created. Tapping it submits immediately (the request
  // details form above was already filled in to get this list), then
  // navigates to the request-tracking page.
  const [selectedNanny, setSelectedNanny] = useState<PreferredCandidate | null>(null);

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

  function fetchRecommendedNannies() {
    if (!location) return;
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
    params.set("endTime", addHours(startTime, CARE_DAY_HOURS));
    params.set("durationDays", days);
    params.set("availability", "conflicts");
    apiFetch<{ results: PreferredCandidate[] }>(`/api/search/caregivers?${params.toString()}`)
      .then((res) => setPreferredCandidates(res.results))
      .catch(() => setPreferredCandidates([]));
  }

  // "Find Care" → the Recommended Nannies list.
  function onFindCare(e: React.FormEvent) {
    e.preventDefault();
    const err = formValidationError();
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);
    setStep("results");
    fetchRecommendedNannies();
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

  // Tapping "Request This Nanny" *is* the real submit — it creates the
  // care request and offers it, via lib/services/dispatch.ts's existing
  // preferred-caregiver path, ONLY to this one nanny (it never falls
  // through to a sequential queue). `location` and the other fields
  // were already validated by onFindCare before this list was shown.
  async function chooseCaregiver(c: PreferredCandidate) {
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
      // The nanny became unavailable between being recommended and Send
      // Request — the request was NOT created. Send the parent back to
      // Recommended Nannies (refreshed) to pick someone else.
      if (err instanceof ApiError && err.code === "nanny_unavailable") {
        setSelectedNanny(null);
        setStep("results");
        setFormError(errorMessage(err));
        fetchRecommendedNannies();
        return;
      }
      setFormError(errorMessage(err));
    }
  }

  // CareLink's finalized fixed-rate model: informational only — exactly
  // the formula the backend independently recomputes and charges from
  // (POST /api/care-requests, never trusting this figure). A standard
  // CARE_DAY_HOURS-hour care day, the regular rate charged once per
  // child per day.
  const priceDays = Math.max(1, Number(days));
  const priceChildCount = Math.max(1, wardIds.length);
  const priceTotal = calculateTotalAmount(type, CARE_DAY_HOURS, priceDays, priceChildCount);

  // Find Care stays disabled until every field the backend will actually
  // require is genuinely filled in — mirrors onFindCare's own checks
  // above, just surfaced before the click instead of after it. Choosing
  // a caregiver happens on the next screen, so it's not part of this
  // check.
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
      {/* Only the form step gets this top Back (out of the request flow).
          The Recommended Nannies step has its own "Edit request details"
          control, and the profile step has "Back to caregivers" — a
          second Back button on either is just noise. */}
      {step === "form" && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}

      {/* No "Request a Nanny" title block — the Back button, the numbered
          sections, and (on the results step) the "Choose a caregiver"
          heading already say where the parent is. */}

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
                Recommended Nannies
              </h2>
              <p className="text-[13px] text-ink-muted">
                Based on your care needs, location and schedule, these CareLink nannies may be a
                good fit. Pick one and your request goes only to them.
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
                    Not sure who to pick? Ask Nia
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-[12.5px] font-semibold text-ink">
                      Tell Nia what matters to you and she&apos;ll suggest one of the caregivers
                      below.
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
              <p className="text-[13px] text-ink-muted">Finding nannies for your request…</p>
            )}
            {preferredCandidates !== null && filteredPreferredCandidates.length === 0 && (
              <p className="text-[13px] text-ink-muted">
                {preferredSearch.trim()
                  ? `No nannies match “${preferredSearch.trim()}”.`
                  : "No CareLink nannies are available for your requested time right now. Try a different date or time."}
              </p>
            )}
            {filteredPreferredCandidates.length > 0 && (
              <div className="flex flex-col gap-3">
                {filteredPreferredCandidates.map((c) => (
                  <NannyCard
                    key={c.staff_profile_id}
                    nanny={c}
                    disabled={submitting}
                    requesting={
                      submitting && selectedNanny?.staff_profile_id === c.staff_profile_id
                    }
                    highlighted={niaPick?.staffProfileId === c.staff_profile_id}
                    highlightLabel="Nia's suggestion"
                    onRequest={() => {
                      setSelectedNanny(c);
                      setFormError(null);
                      void chooseCaregiver(c);
                    }}
                    onViewProfile={() => viewProfile(c.staff_profile_id)}
                  />
                ))}
              </div>
            )}

            {formError && <p className="text-[13px] text-error">{formError}</p>}
          </Sheet>
        ) : step === "profile" ? (
          <Sheet className="flex flex-col gap-5 border-[var(--color-lavender-border)]">
            <button
              type="button"
              onClick={() => setStep("results")}
              className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={14} /> Back to caregivers
            </button>
            {profileError && <p className="text-[13px] text-error">{profileError}</p>}
            {!profileError && !profileCaregiver && (
              <p className="text-[13px] text-ink-muted">Loading profile…</p>
            )}
            {profileCaregiver && <CaregiverProfileView caregiver={profileCaregiver} />}
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
                    {CARE_DAY_HOURS} hrs/day × GH₵{hourlyRateFor(type)}/hr × {priceDays} day
                    {priceDays === 1 ? "" : "s"}
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
                We&apos;ll show you CareLink nannies who fit your request.
              </p>
            </div>
          </Sheet>
        )}
      </div>
    </div>
  );
}
