"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/section-heading";

const EXAMPLE =
  "I need a babysitter in East Legon this Saturday from 9am to 4pm for my 4-year-old…";

// Real functionality, deferred until sign-in: /api/search/parse (the
// Claude-powered parser) requires a signed-in parent, so this can't
// call it directly from an anonymous homepage visit without either
// exposing the endpoint publicly (a real cost/abuse risk) or faking
// the result. Instead the typed query travels to sign-in as ?next=,
// and app/parent/page.tsx picks up the same ?q= and runs the real
// parse + search the moment the visitor is authenticated.
export function AiSearchSection() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    const next = `/parent?q=${encodeURIComponent(query.trim())}`;
    router.push(`/sign-in?next=${encodeURIComponent(next)}`);
  }

  return (
    <section id="find-care" className="scroll-mt-20">
      <div className="rounded-[24px] border border-hairline bg-sage-tint p-8 sm:p-12">
        <SectionHeading
          eyebrow="AI-assisted search"
          title="Just tell CareLink what you need."
          description="You don't have to know exactly what to search for. Describe the care you're looking for in your own words."
        />

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
          <div className="flex items-end gap-3 rounded-[18px] border border-hairline bg-sheet p-4 shadow-[var(--shadow-card)]">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={EXAMPLE}
              rows={2}
              className="flex-1 resize-none bg-transparent text-[15px] text-ink placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          <div>
            <Button type="submit">
              <MagnifyingGlass size={18} /> Find my matches →
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-[14px] border border-hairline bg-sheet/70 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
            We understood
          </p>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {["Babysitter", "East Legon", "Saturday", "9:00 AM – 4:00 PM", "4 years"].map((tag) => (
              <span key={tag} className="rounded-full bg-sage-tint px-3 py-1 text-sage-pressed">
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3 text-[12px] text-ink-muted">
            Example of what CareLink understands from a request like the one above — sign in to run
            your own.
          </p>
        </div>
      </div>
    </section>
  );
}
