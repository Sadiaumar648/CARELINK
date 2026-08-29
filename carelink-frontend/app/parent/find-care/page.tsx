"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Funnel, MagnifyingGlass, X } from "@phosphor-icons/react";
import { apiFetch, ApiError } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { CaregiverCardSkeleton } from "@/components/ui/skeleton";
import { FilterFields } from "@/components/find-care/filter-fields";
import { CaregiverResultCard } from "@/components/find-care/caregiver-result-card";
import {
  skillLabel,
  activeFilterCount,
  type CaregiverResult,
  type SearchFilters,
  type Ward,
} from "@/components/find-care/types";

type SortKey = "recommended" | "rating" | "experience" | "rate";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "rating", label: "Highest rated" },
  { value: "experience", label: "Most experienced" },
  { value: "rate", label: "Lowest rate" },
];

function sortResults(results: CaregiverResult[], sortBy: SortKey): CaregiverResult[] {
  const sorted = [...results];
  switch (sortBy) {
    case "rating":
      return sorted.sort((a, b) => (b.rating_avg ?? -1) - (a.rating_avg ?? -1));
    case "experience":
      return sorted.sort((a, b) => (b.years_experience ?? -1) - (a.years_experience ?? -1));
    case "rate":
      return sorted.sort((a, b) => a.hourly_rate - b.hourly_rate);
    default:
      return sorted.sort((a, b) => b.matchScore - a.matchScore);
  }
}

function suggestedSkillForAge(age: number): string {
  if (age === 0) return "newborn_care";
  if (age <= 2) return "infant_care";
  if (age <= 4) return "toddler_care";
  return "school_age_supervision";
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function FindCarePage() {
  const searchParams = useSearchParams();
  const [nlQuery, setNlQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<SearchFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({});
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [selectedWardId, setSelectedWardId] = useState("");

  const [results, setResults] = useState<CaregiverResult[] | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    apiFetch<{ wards: Ward[] }>("/api/wards")
      .then((res) => setWards(res.wards))
      .catch(() => setWards([]));
  }, []);

  function onSelectWard(wardId: string) {
    setSelectedWardId(wardId);
    const ward = wards?.find((w) => w.id === wardId);
    if (!ward) return;
    const suggested = suggestedSkillForAge(ward.age_years);
    setFilters((f) => {
      const current = f.skills ?? [];
      if (current.includes(suggested)) return f;
      return { ...f, skills: [...current, suggested] };
    });
  }

  function patchFilters(patch: Partial<SearchFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  async function runSearch(activeFilters: SearchFilters) {
    setLoading(true);
    setError(null);
    setValidationError(null);
    setEmptyMessage(null);
    setHasSearched(true);
    setMobileFiltersOpen(false);
    try {
      const params = new URLSearchParams();
      if (activeFilters.area) params.set("area", activeFilters.area);
      if (activeFilters.date) params.set("date", activeFilters.date);
      if (activeFilters.startTime) params.set("startTime", activeFilters.startTime);
      if (activeFilters.endTime) params.set("endTime", activeFilters.endTime);
      if (activeFilters.budgetCeiling)
        params.set("budgetCeiling", String(activeFilters.budgetCeiling));
      if (activeFilters.minExperience)
        params.set("minExperience", String(activeFilters.minExperience));
      if (activeFilters.minRating) params.set("minRating", String(activeFilters.minRating));
      if (activeFilters.skills?.length) params.set("skills", activeFilters.skills.join(","));

      const res = await apiFetch<{
        results: CaregiverResult[];
        emptyState: { message: string } | null;
      }>(`/api/search/caregivers?${params.toString()}`);

      setAppliedFilters(activeFilters);
      setResults(res.results);
      if (res.results.length === 0 && res.emptyState) setEmptyMessage(res.emptyState.message);
    } catch (err) {
      // A 400 here means the filter combination itself is invalid (e.g. a
      // start time without an end time) — that's the parent's to fix, not
      // a failure worth a full error screen and "Try Again".
      if (err instanceof ApiError && err.status === 400) setValidationError(errorMessage(err));
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function onFindCare() {
    if (!nlQuery.trim()) {
      void runSearch(filters);
      return;
    }
    setLoading(true);
    setError(null);
    setValidationError(null);
    try {
      const res = await apiFetch<{ filters: Partial<SearchFilters> | null }>("/api/search/parse", {
        method: "POST",
        body: { query: nlQuery },
      });
      const merged = { ...filters, ...(res.filters ?? {}) };
      setFilters(merged);
      await runSearch(merged);
      // runSearch resets validationError itself, so this has to land after
      // it settles rather than before — otherwise its own reset wipes it.
      if (!res.filters) {
        setValidationError("Couldn't understand that — try the filters below instead.");
      }
    } catch (err) {
      setLoading(false);
      setError(errorMessage(err));
    }
  }

  function removeFilters(keys: (keyof SearchFilters)[]) {
    const next = { ...filters };
    for (const key of keys) delete next[key];
    setFilters(next);
    void runSearch(next);
  }

  function clearAll() {
    setFilters({});
    setSelectedWardId("");
    setNlQuery("");
    void runSearch({});
  }

  // A query arriving from the homepage or dashboard's search box lands
  // here as ?q= — run it once, the same way typing it in and pressing
  // "Find Care" would.
  useEffect(() => {
    const initial = searchParams.get("q");
    if (!initial) return;
    let cancelled = false;
    apiFetch<{ filters: Partial<SearchFilters> | null }>("/api/search/parse", {
      method: "POST",
      body: { query: initial },
    })
      .then((res) => {
        if (cancelled) return undefined;
        setLoading(true);
        const parsed = res.filters ?? {};
        setFilters(parsed);
        setAppliedFilters(parsed);
        setHasSearched(true);

        const params = new URLSearchParams();
        if (parsed.area) params.set("area", parsed.area);
        if (parsed.budgetCeiling) params.set("budgetCeiling", String(parsed.budgetCeiling));
        if (parsed.minExperience) params.set("minExperience", String(parsed.minExperience));
        if (parsed.skills?.length) params.set("skills", parsed.skills.join(","));

        return apiFetch<{
          results: CaregiverResult[];
          emptyState: { message: string } | null;
        }>(`/api/search/caregivers?${params.toString()}`).then((searchRes) => {
          if (cancelled) return;
          setResults(searchRes.results);
          if (searchRes.results.length === 0 && searchRes.emptyState) {
            setEmptyMessage(searchRes.emptyState.message);
          }
        });
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, on the initial ?q= only
  }, []);

  const selectedWard = wards?.find((w) => w.id === selectedWardId) ?? null;
  const sortedResults = results ? sortResults(results, sortBy) : null;
  const filterCount = activeFilterCount(filters);

  const chips: { keys: (keyof SearchFilters)[]; label: string }[] = [];
  if (filters.area) chips.push({ keys: ["area"], label: filters.area });
  if (filters.date) {
    // A time window needs a date server-side, so dropping the date has to
    // take any time range with it or the next search would 400.
    const keys: (keyof SearchFilters)[] =
      filters.startTime || filters.endTime ? ["date", "startTime", "endTime"] : ["date"];
    chips.push({ keys, label: formatDate(filters.date) });
  }
  if (filters.startTime && filters.endTime) {
    chips.push({
      keys: ["startTime", "endTime"],
      label: `${filters.startTime}–${filters.endTime}`,
    });
  }
  if (filters.minExperience) {
    chips.push({ keys: ["minExperience"], label: `${filters.minExperience}+ yrs` });
  }
  if (filters.budgetCeiling) {
    chips.push({ keys: ["budgetCeiling"], label: `Under GH₵${filters.budgetCeiling}/hr` });
  }
  if (filters.minRating) {
    chips.push({ keys: ["minRating"], label: `${filters.minRating.toFixed(1)}+ rating` });
  }
  if (filters.skills?.length) {
    chips.push({ keys: ["skills"], label: filters.skills.map(skillLabel).join(", ") });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] font-semibold font-heading">
          Find the right care for your family
        </h1>
        <p className="text-[15px] text-ink-muted">
          Tell us what you need and we&apos;ll help you explore available caregivers.
        </p>
      </div>

      <Sheet className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold text-ink">What kind of care do you need?</h2>
        <Field
          label="Describe the care you're looking for"
          placeholder="I need a babysitter this Saturday from 9am to 4pm for my 4-year-old…"
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void onFindCare()}
        />
        <Button
          type="button"
          onClick={() => void onFindCare()}
          disabled={loading}
          className="self-start"
        >
          <MagnifyingGlass size={18} /> Find Care →
        </Button>
        {validationError && <p className="text-[13px] text-error">{validationError}</p>}
      </Sheet>

      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Button variant="secondary" onClick={() => setMobileFiltersOpen(true)}>
          <Funnel size={16} /> Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </Button>
        {sortedResults && sortedResults.length > 0 && (
          <select
            aria-label="Sort caregivers"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] font-semibold text-ink"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
        <aside id="search-filters" className="hidden flex-col gap-6 lg:flex">
          <Sheet className="flex flex-col gap-6">
            <h2 className="text-[15px] font-semibold text-ink">Filters</h2>
            <FilterFields
              filters={filters}
              onChange={patchFilters}
              wards={wards}
              selectedWardId={selectedWardId}
              onSelectWard={onSelectWard}
            />
            <Button onClick={() => void runSearch(filters)} disabled={loading}>
              Update Results
            </Button>
            {filterCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="text-[13px] font-semibold text-ink-muted hover:text-ink"
              >
                Clear all
              </button>
            )}
          </Sheet>
        </aside>

        <div className="flex flex-col gap-6">
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <button
                  key={chip.keys.join("-")}
                  type="button"
                  onClick={() => removeFilters(chip.keys)}
                  className="flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1.5 text-[12.5px] font-medium text-sage-pressed hover:bg-sage/20"
                >
                  {chip.label}
                  <X size={12} weight="bold" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-[12.5px] font-semibold text-ink-muted hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}

          {hasSearched && !loading && (
            <Sheet className="flex flex-col gap-1 text-[13px]">
              <p className="font-semibold text-ink">Looking for:</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-ink-muted">
                {selectedWard && (
                  <span>
                    For: {selectedWard.display_name}, {selectedWard.age_years}
                  </span>
                )}
                {appliedFilters.area && <span>Location: {appliedFilters.area}</span>}
                {appliedFilters.date && <span>Date: {formatDate(appliedFilters.date)}</span>}
                {appliedFilters.startTime && appliedFilters.endTime && (
                  <span>
                    Time: {appliedFilters.startTime} – {appliedFilters.endTime}
                  </span>
                )}
                {!selectedWard && !appliedFilters.area && !appliedFilters.date && (
                  <span>All available caregivers</span>
                )}
              </div>
            </Sheet>
          )}

          <div className="hidden items-center justify-between lg:flex">
            <p className="text-[15px] font-semibold text-ink">
              {sortedResults
                ? `${sortedResults.length} caregiver${sortedResults.length === 1 ? "" : "s"} match your needs`
                : "Caregivers matching your search"}
            </p>
            {sortedResults && sortedResults.length > 0 && (
              <select
                aria-label="Sort caregivers"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] font-semibold text-ink"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {loading && (
            <div className="flex flex-col gap-4">
              <p className="text-[13px] text-ink-muted">Searching for care…</p>
              <CaregiverCardSkeleton />
              <CaregiverCardSkeleton />
            </div>
          )}

          {!loading && error && <ErrorState onRetry={() => void runSearch(filters)} />}

          {!loading && !error && hasSearched && sortedResults?.length === 0 && (
            <EmptyState
              icon={MagnifyingGlass}
              title="We couldn't find an exact match."
              description={
                emptyMessage ?? "Try adjusting your search or filters to see more caregivers."
              }
              action={
                <Button variant="secondary" onClick={clearAll}>
                  Clear Filters
                </Button>
              }
            />
          )}

          {!loading && !error && sortedResults && sortedResults.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {sortedResults.map((c) => (
                <CaregiverResultCard
                  key={c.staff_profile_id}
                  caregiver={c}
                  appliedFilters={appliedFilters}
                />
              ))}
            </div>
          )}

          {!loading && !error && !hasSearched && (
            <p className="text-[14px] text-ink-muted">
              Describe what you need above, or use the filters to browse caregivers.
            </p>
          )}
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-paper lg:hidden">
          <div className="flex items-center justify-between border-b border-hairline p-4">
            <h2 className="text-[17px] font-semibold font-heading">Filters</h2>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              aria-label="Close filters"
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-sage-tint"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <FilterFields
              filters={filters}
              onChange={patchFilters}
              wards={wards}
              selectedWardId={selectedWardId}
              onSelectWard={onSelectWard}
            />
          </div>
          <div className="flex flex-col gap-2 border-t border-hairline p-4">
            <Button onClick={() => void runSearch(filters)} disabled={loading}>
              Apply Filters
            </Button>
            {filterCount > 0 && (
              <Button variant="secondary" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ParentFindCarePageWrapper() {
  return (
    <Suspense>
      <FindCarePage />
    </Suspense>
  );
}
