"use client";

import { useState } from "react";
import { CaretDown, Sparkle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { caregiverTypeLabel } from "@/components/find-care/types";

// Always presented as advice, never a decision — both buttons are
// equally real actions, and choosing "the other one" is exactly as
// valid as accepting the suggestion. This is the AI's one and only
// caregiver-type opinion in the whole flow; nothing downstream trusts
// it without the parent's own click.
export function RecommendationCard({
  recommendation,
  onChoose,
}: {
  recommendation: { type: "nanny" | "babysitter"; reason: string };
  onChoose: (type: "nanny" | "babysitter") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const other = recommendation.type === "nanny" ? "babysitter" : "nanny";

  return (
    <Sheet className="flex flex-col gap-3 border-[var(--color-lavender-border)]">
      <div className="flex items-center gap-2">
        <Sparkle size={16} weight="fill" className="text-wisteria" />
        <p className="text-[13.5px] font-semibold text-ink">
          Recommended: {caregiverTypeLabel(recommendation.type)}
        </p>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex items-center gap-1.5 self-start text-[12.5px] font-semibold text-wisteria hover:text-wisteria-hover"
      >
        <CaretDown
          size={12}
          className={expanded ? "rotate-180 transition-transform" : "transition-transform"}
        />
        Why this recommendation?
      </button>
      {expanded && (
        <p className="text-[13px] leading-relaxed text-ink-muted">{recommendation.reason}</p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="accent" onClick={() => onChoose(recommendation.type)}>
          Continue with {caregiverTypeLabel(recommendation.type)}
        </Button>
        <Button variant="secondary" onClick={() => onChoose(other)}>
          Choose {caregiverTypeLabel(other)} Instead
        </Button>
      </div>
    </Sheet>
  );
}
