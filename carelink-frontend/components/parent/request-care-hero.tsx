"use client";

import Image from "next/image";
import { ArrowRight, MapPin, ShieldCheck } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";

// The one real entry point into a request now that Nanny and Babysitter
// are merged into a single "Nanny" concept for parents — replaces the
// old side-by-side CareTypeCard pair. A parent no longer chooses a type
// up front; "Find Care" opens the request form directly, and who to
// send it to is chosen afterwards from a real, nearby, verified list
// (see request-flow-panel.tsx's own two-step flow).
export function RequestCareHero({ onClick }: { onClick: () => void }) {
  return (
    <Sheet className="overflow-hidden border-[var(--color-lavender-border)] p-0">
      <button
        type="button"
        onClick={onClick}
        className="group relative flex w-full flex-col sm:flex-row sm:items-stretch"
      >
        <div className="relative aspect-[16/9] w-full sm:aspect-auto sm:w-2/5">
          <Image
            src="/demo/hero-reading.jpeg"
            alt="A CareLink nanny reading with a child"
            fill
            sizes="(min-width: 640px) 340px, 100vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
        <div className="flex flex-1 flex-col items-start gap-3 p-6 text-left">
          <span className="flex items-center gap-1.5 rounded-full bg-wisteria-tint px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-wisteria-pressed">
            <ShieldCheck size={13} weight="fill" /> Verified agency caregivers
          </span>
          <div>
            <p className="text-[20px] font-semibold font-heading text-ink">Find a Nanny near you</p>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              Tell us what you need and where — we&apos;ll show you real, nearby, verified
              caregivers to choose from.
            </p>
          </div>
          <span className="mt-auto flex items-center gap-2 text-[13.5px] font-semibold text-wisteria">
            <MapPin size={15} weight="fill" /> Find Care
            <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </button>
    </Sheet>
  );
}
