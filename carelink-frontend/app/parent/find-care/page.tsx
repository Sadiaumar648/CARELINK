"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Funnel,
  MagnifyingGlass,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
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
  caregiverTypeLabel,
  suggestedSkillForAge,
  type CaregiverResult,
  type SearchFilters,
  type Ward,
} from "@/components/find-care/types";

type SortKey = "recommended" | "rating" | "experience" | "rate";

const PAGE_SIZE = 6;

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
  const [rawResults, setRawResults] = useState<CaregiverResult[] | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("recommended");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  // caregiverType/fromRequestFlow/relaxationNotice are all specific to
  // arriving here from the parent Home page's Nanny/Babysitter request
  // flow (?type=&panel=…) — every one of them is a no-op when absent, so
  // the pre-existing manual-filter and ?q= AI-search paths behave exactly
  // as before.
  const [caregiverType, setCaregiverType] = useState<"nanny" | "babysitter" | undefined>();
  const [fromRequestFlow, setFromRequestFlow] = useState(false);
  // Which request flow this search came from — decides where "Edit your
  // request" sends the parent back to: the CareLink AI conversation, or
  // the direct Nanny/Babysitter panel on Home.
  const [requestSource, setRequestSource] = useState<"ai" | "direct" | null>(null);
  const [relaxationNotice, setRelaxationNotice] = useState<string | null>(null);

  function selectSort(key: SortKey) {
    setSortBy(key);
    setPage(1);
  }

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

  async function fetchStage(
    activeFilters: SearchFilters,
  ): Promise<{ results: CaregiverResult[]; emptyState: { message: string } | null }> {
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

    return apiFetch<{ results: CaregiverResult[]; emptyState: { message: string } | null }>(
      `/api/search/caregivers?${params.toString()}`,
    );
  }

  function applyTypeFilter(list: CaregiverResult[], type = caregiverType): CaregiverResult[] {
    return type ? list.filter((c) => c.caregiver_type === type) : list;
  }

  // Real, honest progressive relaxation: every stage is an actual second
  // (or third) call to the existing search endpoint with fewer filters —
  // never a fabricated "no results" screen when a broader search would
  // have found someone. Availability (date/time) is never relaxed, and
  // verification is never a filter to begin with (public_caregivers only
  // ever surfaces verified, accepting-bookings profiles).
  async function runSearch(activeFilters: SearchFilters) {
    setLoading(true);
    setError(null);
    setValidationError(null);
    setEmptyMessage(null);
    setRelaxationNotice(null);
    setHasSearched(true);
    setFiltersOpen(false);
    setPage(1);
    try {
      let effective = activeFilters;
      let raw = await fetchStage(effective);
      let typed = applyTypeFilter(raw.results);

      if (typed.length === 0 && effective.area) {
        const relaxed = { ...effective, area: undefined };
        const res = await fetchStage(relaxed);
        const relaxedTyped = applyTypeFilter(res.results);
        raw = res;
        typed = relaxedTyped;
        effective = relaxed;
        if (relaxedTyped.length > 0) {
          setRelaxationNotice(
            `We couldn't find an exact match in ${activeFilters.area} — here are ${relaxedTyped.length} verified caregiver${relaxedTyped.length === 1 ? "" : "s"} available at your requested time.`,
          );
        }
      }

      if (typed.length === 0 && (effective.skills?.length || effective.minExperience)) {
        const relaxed = { ...effective, skills: undefined, minExperience: undefined };
        const res = await fetchStage(relaxed);
        const relaxedTyped = applyTypeFilter(res.results);
        raw = res;
        typed = relaxedTyped;
        effective = relaxed;
        if (relaxedTyped.length > 0) {
          setRelaxationNotice(
            `We broadened your search to find ${relaxedTyped.length} available caregiver${relaxedTyped.length === 1 ? "" : "s"}.`,
          );
        }
      }

      setAppliedFilters(effective);
      setRawResults(raw.results);
      setResults(typed);
      if (typed.length === 0) {
        if (caregiverType && raw.results.length > 0) {
          setEmptyMessage(
            `There were caregivers available, but none are registered as a ${caregiverTypeLabel(caregiverType)} — try Find Care to browse everyone.`,
          );
        } else if (raw.emptyState) {
          setEmptyMessage(raw.emptyState.message);
        } else {
          setEmptyMessage(
            "We couldn't find any caregivers matching your request, even after broadening the search.",
          );
        }
      }
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

  // The primary AI search box: each submission is a fresh statement of
  // what the parent wants, so the parsed result REPLACES the current
  // filters entirely rather than merging onto whatever was there before
  // (a previous search's area/date/skills must never leak into this
  // one) — and since the model is never asked for and never returns a
  // ward/child field, any previously-selected ward is cleared too, so
  // the results page can't show a child that wasn't mentioned in this
  // query. "Refine filters" (patchFilters, below) is the one place
  // incremental merging is correct, since refining is explicitly meant
  // to add to what the AI already set.
  async function onFindCare() {
    setSelectedWardId("");
    if (!nlQuery.trim()) {
      setFilters({});
      void runSearch({});
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
      const parsed = res.filters ?? {};
      setFilters(parsed);
      await runSearch(parsed);
      // runSearch resets validationError itself, so this has to land after
      // it settles rather than before — otherwise its own reset wipes it.
      if (!res.filters) {
        setValidationError(
          "Couldn't fully understand your request — try refining your search below.",
        );
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

  // A request arriving from the parent Home page's Nanny/Babysitter
  // request flow lands here as ?panel=nanny|babysitter plus the already-
  // resolved structured filters (area/date/startTime/endTime/skills) —
  // that flow already ran its own free-text field through the AI parser
  // itself, so this runs the search directly rather than re-parsing.
  // No-ops (and never fires alongside the ?q= effect above) when neither
  // param is present, so every other entry point into this page is
  // unaffected.
  useEffect(() => {
    const type = searchParams.get("type");
    const panel = searchParams.get("panel");
    if (!panel && !type) return;

    const parsed: SearchFilters = {};
    const area = searchParams.get("area");
    const date = searchParams.get("date");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");
    const skills = searchParams.get("skills");
    if (area) parsed.area = area;
    if (date) parsed.date = date;
    if (startTime) parsed.startTime = startTime;
    if (endTime) parsed.endTime = endTime;
    if (skills) parsed.skills = skills.split(",").filter(Boolean);

    // A synchronous external read (the URL), so the resulting state
    // updates are deferred out of the effect body itself.
    const source = searchParams.get("source");
    void Promise.resolve().then(() => {
      if (type === "nanny" || type === "babysitter") setCaregiverType(type);
      setFromRequestFlow(true);
      setRequestSource(source === "ai" ? "ai" : "direct");
      setFilters(parsed);
      void runSearch(parsed);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once, from the initial structured params only
  }, []);

  const selectedWard = wards?.find((w) => w.id === selectedWardId) ?? null;
  const sortedResults = results ? sortResults(results, sortBy) : null;
  const filterCount = activeFilterCount(filters);
  const totalPages = sortedResults ? Math.max(1, Math.ceil(sortedResults.length / PAGE_SIZE)) : 1;
  const currentPage = Math.min(page, totalPages);
  const pagedResults = sortedResults?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const chips: {
    keys: (keyof SearchFilters)[];
    label: string;
    ward?: boolean;
    caregiverType?: boolean;
  }[] = [];
  if (caregiverType) {
    chips.push({ keys: [], label: caregiverTypeLabel(caregiverType) ?? "", caregiverType: true });
  }
  if (selectedWard) {
    chips.push({
      keys: [],
      label: `${selectedWard.display_name}, ${selectedWard.age_years}`,
      ward: true,
    });
  }
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
    chips.push({ keys: ["minExperience"], label: `${filters.minExperience}+ yrs experience` });
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

  function removeChip(chip: {
    keys: (keyof SearchFilters)[];
    ward?: boolean;
    caregiverType?: boolean;
  }) {
    if (chip.ward) {
      setSelectedWardId("");
      return;
    }
    if (chip.caregiverType) {
      // A pure client-side filter on data already in hand — no refetch,
      // just show the untyped set from whichever stage last succeeded.
      setCaregiverType(undefined);
      if (rawResults) setResults(rawResults);
      return;
    }
    removeFilters(chip.keys);
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
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-sage">
          <ShieldCheck size={16} weight="fill" /> Every caregiver shown here has passed
          CareLink&apos;s identity verification.
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
        {validationError && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13px] text-error">{validationError}</p>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="text-[13px] font-semibold text-sage hover:text-sage-hover"
            >
              Refine filters →
            </button>
          </div>
        )}
      </Sheet>

      <div id="search-results-top" className="flex flex-col gap-4 scroll-mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">
            {sortedResults
              ? `${sortedResults.length} caregiver${sortedResults.length === 1 ? "" : "s"} match your needs`
              : "Caregivers matching your search"}
          </p>
          <div className="flex items-center gap-2">
            {sortedResults && sortedResults.length > 0 && (
              <select
                aria-label="Sort caregivers"
                value={sortBy}
                onChange={(e) => selectSort(e.target.value as SortKey)}
                className="rounded-[10px] border border-hairline bg-sheet px-3 py-2 text-[13px] font-semibold text-ink"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <Button variant="secondary" onClick={() => setFiltersOpen(true)}>
              <Funnel size={16} /> Refine filters{filterCount > 0 ? ` (${filterCount})` : ""}
            </Button>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <button
                key={
                  chip.ward ? "ward" : chip.caregiverType ? "caregiverType" : chip.keys.join("-")
                }
                type="button"
                onClick={() => removeChip(chip)}
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
              <div className="flex flex-wrap items-center justify-center gap-3">
                {fromRequestFlow && (
                  <Link
                    href={`${requestSource === "ai" ? "/parent/care-ai" : "/parent"}?${searchParams.toString()}`}
                  >
                    <Button variant="secondary">Edit your request</Button>
                  </Link>
                )}
                <Button variant="secondary" onClick={clearAll}>
                  Clear Filters
                </Button>
              </div>
            }
          />
        )}

        {!loading && !error && sortedResults && sortedResults.length > 0 && (
          <>
            {relaxationNotice && (
              <p className="rounded-[10px] bg-wisteria-tint px-3.5 py-2.5 text-[13px] font-medium text-wisteria-pressed">
                {relaxationNotice}
              </p>
            )}
            <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pagedResults?.map((c) => (
                <CaregiverResultCard
                  key={c.staff_profile_id}
                  caregiver={c}
                  appliedFilters={appliedFilters}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1.5 rounded-[10px] border border-hairline px-3 py-2 text-[13px] font-semibold text-ink hover:border-sage hover:text-sage disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink"
                >
                  <ArrowLeft size={15} /> Previous
                </button>
                <p className="text-[13px] font-medium text-ink-muted">
                  Page {currentPage} of {totalPages}
                </p>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1.5 rounded-[10px] border border-hairline px-3 py-2 text-[13px] font-semibold text-ink hover:border-sage hover:text-sage disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-hairline disabled:hover:text-ink"
                >
                  Next <ArrowRight size={15} />
                </button>
              </div>
            )}
          </>
        )}

        {!loading && !error && !hasSearched && (
          <p className="text-[14px] text-ink-muted">
            Describe what you need above, or use Refine filters to browse caregivers.
          </p>
        )}
      </div>

      {filtersOpen && (
        <div className="fixed inset-0 z-30 flex flex-col bg-paper">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline p-4">
              <h2 className="text-[17px] font-semibold font-heading">Refine filters</h2>
              <button
                type="button"
                onClick={() => setFiltersOpen(false)}
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
