"use client";

import { useState } from "react";
import Link from "next/link";
import { MagnifyingGlass, Star } from "@phosphor-icons/react";
import { skillTagSchema } from "@carelink/shared";
import { apiFetch } from "@/lib/api/client";
import { errorMessage } from "@/lib/error-message";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";

type ParsedFilters = {
  area?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  budgetCeiling?: number;
  minExperience?: number;
  skills?: string[];
};

type CaregiverResult = {
  staff_profile_id: string;
  full_name: string;
  hourly_rate: number;
  years_experience: number | null;
  rating_avg: number | null;
  rating_count: number;
  skills: string[];
  matchScore: number;
};

function skillLabel(skill: string): string {
  return skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ParentSearchPage() {
  const [nlQuery, setNlQuery] = useState("");
  const [filters, setFilters] = useState<ParsedFilters>({});
  const [results, setResults] = useState<CaregiverResult[] | null>(null);
  const [emptyState, setEmptyState] = useState<{ message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parseQuery() {
    if (!nlQuery.trim()) return;
    setError(null);
    try {
      const res = await apiFetch<{ filters: ParsedFilters | null }>("/api/search/parse", {
        method: "POST",
        body: { query: nlQuery },
      });
      if (res.filters) setFilters((prev) => ({ ...prev, ...res.filters }));
      else setError("Couldn't understand that — try the filters below instead.");
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function toggleSkill(skill: string) {
    setFilters((prev) => {
      const current = prev.skills ?? [];
      const skills = current.includes(skill)
        ? current.filter((s) => s !== skill)
        : [...current, skill];
      return { ...prev, skills: skills.length > 0 ? skills : undefined };
    });
  }

  async function search() {
    setLoading(true);
    setError(null);
    setEmptyState(null);
    try {
      const params = new URLSearchParams();
      if (filters.area) params.set("area", filters.area);
      if (filters.budgetCeiling) params.set("budgetCeiling", String(filters.budgetCeiling));
      if (filters.minExperience) params.set("minExperience", String(filters.minExperience));
      if (filters.skills?.length) params.set("skills", filters.skills.join(","));

      const res = await apiFetch<{
        results: CaregiverResult[];
        emptyState: { restrictiveFilter: string | null; message: string } | null;
      }>(`/api/search/caregivers?${params.toString()}`);

      setResults(res.results);
      if (res.results.length === 0 && res.emptyState) setEmptyState(res.emptyState);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-[26px] font-semibold">Find a caregiver</h1>

      <Sheet className="flex flex-col gap-4">
        <Field
          label="Describe what you need"
          placeholder="Toddler care in East Legon, under GH₵25/hr"
          value={nlQuery}
          onChange={(e) => setNlQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void parseQuery()}
        />
        <Button type="button" variant="secondary" onClick={() => void parseQuery()}>
          <MagnifyingGlass size={18} /> Fill filters from this
        </Button>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Area"
            value={filters.area ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value || undefined }))}
          />
          <Field
            label="Budget ceiling (GH₵/hr)"
            type="number"
            value={filters.budgetCeiling ?? ""}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                budgetCeiling: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Skills
          </span>
          <div className="flex flex-wrap gap-2">
            {skillTagSchema.options.map((skill) => {
              const active = filters.skills?.includes(skill) ?? false;
              return (
                <button
                  key={skill}
                  type="button"
                  onClick={() => toggleSkill(skill)}
                  className={`rounded border px-3 py-2 text-[13px] font-semibold ${
                    active
                      ? "border-cyan bg-cyan/10 text-cyan-pressed"
                      : "border-hairline text-ink-muted"
                  }`}
                >
                  {skillLabel(skill)}
                </button>
              );
            })}
          </div>
        </div>

        <Button type="button" onClick={() => void search()} disabled={loading}>
          {loading ? "Searching…" : "Search"}
        </Button>
        {error && <p className="text-[13px] text-magenta">{error}</p>}
      </Sheet>

      {emptyState && <p className="text-[15px] text-ink-muted">{emptyState.message}</p>}

      {results && results.length > 0 && (
        <div className="flex flex-col gap-4">
          {results.map((c) => (
            <Sheet key={c.staff_profile_id} className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Link
                  href={`/parent/caregivers/${c.staff_profile_id}`}
                  className="text-[17px] font-semibold hover:text-cyan"
                >
                  {c.full_name}
                </Link>
                <p className="text-[13px] text-ink-muted">
                  {c.years_experience ?? 0} yrs experience · {c.skills.map(skillLabel).join(", ")}
                </p>
                <p className="flex items-center gap-1 text-[13px] text-ink-muted">
                  <Star size={14} weight="fill" />
                  {c.rating_avg ? c.rating_avg.toFixed(1) : "New"} ({c.rating_count})
                </p>
              </div>
              <div className="text-right">
                <p className="text-[19px] font-semibold tabular-nums">GH₵{c.hourly_rate}/hr</p>
                <p className="text-[13px] text-ink-muted">Match {Math.round(c.matchScore)}%</p>
              </div>
            </Sheet>
          ))}
        </div>
      )}
    </div>
  );
}
