"use client";

import { Sparkle } from "@phosphor-icons/react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Nia's old job was recommending Nanny vs Babysitter — now that those
// are merged into one "Nanny" concept for parents, there's nothing left
// to recommend between. This card instead appears once Nia has a
// reasonable picture of what the parent needs (readyToConfirm from the
// backend), inviting them to continue to the real request form — where
// everything she gathered (care needs, timing, notes — never location,
// per CareLink's standing rule) arrives pre-filled for the parent to
// review and finish themselves.
export function ContinueToRequestCard({ onContinue }: { onContinue: () => void }) {
  return (
    <Sheet className="flex flex-col gap-3 border-[var(--color-lavender-border)]">
      <div className="flex items-center gap-2">
        <Sparkle size={16} weight="fill" className="text-wisteria" />
        <p className="text-[13.5px] font-semibold text-ink">Ready when you are</p>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">
        I&apos;ve got a good sense of what you need. Continue to the request form to review the
        details, add your exact care location, and choose a caregiver.
      </p>
      <Button onClick={onContinue} className="w-fit">
        Continue to request form
      </Button>
    </Sheet>
  );
}
