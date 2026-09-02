"use client";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { caregiverTypeLabel, skillLabel, type Ward } from "@/components/find-care/types";
import type { CareRequestDraft } from "@carelink/shared";

function formatDateLong(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// A real ward picker sourced from the parent's actual wards — the AI
// never silently assigns one. Confirming is disabled until a real ward
// is chosen, even if every other field is ready.
export function ConfirmationCard({
  draft,
  wards,
  wardId,
  onSelectWard,
  onConfirm,
  onEdit,
  confirming,
}: {
  draft: CareRequestDraft;
  wards: Ward[];
  wardId: string;
  onSelectWard: (id: string) => void;
  onConfirm: () => void;
  onEdit: () => void;
  confirming: boolean;
}) {
  const canConfirm = Boolean(
    wardId &&
    draft.caregiverType &&
    draft.date &&
    draft.startTime &&
    draft.endTime &&
    draft.location,
  );

  return (
    <Sheet className="flex flex-col gap-4 border-[var(--color-lavender-border)]">
      <div>
        <h2 className="text-[16px] font-semibold font-heading text-ink">
          Here&apos;s what I understood
        </h2>
        <p className="text-[13px] text-ink-muted">
          Review the details, then confirm to find caregivers.
        </p>
      </div>

      <div className="flex flex-col gap-2 text-[14px]">
        <div className="flex justify-between border-b border-[var(--color-lavender-border)] pb-2">
          <span className="text-ink-muted">Care type</span>
          <span className="font-semibold text-ink">
            {caregiverTypeLabel(draft.caregiverType ?? null) ?? "—"}
          </span>
        </div>
        <div className="flex items-center justify-between border-b border-[var(--color-lavender-border)] pb-2">
          <span className="text-ink-muted">Ward</span>
          {wards.length > 0 ? (
            <select
              value={wardId}
              onChange={(e) => onSelectWard(e.target.value)}
              className="rounded-[8px] border border-[var(--color-lavender-border)] bg-sheet px-2 py-1 text-[13.5px] font-semibold text-ink"
            >
              <option value="" disabled>
                Choose a child
              </option>
              {wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.display_name} ({w.age_years})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-[12.5px] text-error">Add a child first</span>
          )}
        </div>
        {draft.date && (
          <div className="flex justify-between border-b border-[var(--color-lavender-border)] pb-2">
            <span className="text-ink-muted">Date</span>
            <span className="font-semibold text-ink">{formatDateLong(draft.date)}</span>
          </div>
        )}
        {draft.startTime && draft.endTime && (
          <div className="flex justify-between border-b border-[var(--color-lavender-border)] pb-2">
            <span className="text-ink-muted">Time</span>
            <span className="font-semibold text-ink">
              {draft.startTime} – {draft.endTime}
            </span>
          </div>
        )}
        <div className="flex justify-between border-b border-[var(--color-lavender-border)] pb-2">
          <span className="text-ink-muted">Location</span>
          <span className="font-semibold text-ink">{draft.location ?? "—"}</span>
        </div>
        {draft.skills && draft.skills.length > 0 && (
          <div className="flex flex-col gap-1.5 pb-1">
            <span className="text-ink-muted">Care needs</span>
            <div className="flex flex-wrap gap-1.5">
              {draft.skills.map((s) => (
                <span
                  key={s}
                  className="rounded-full bg-wisteria-tint px-2.5 py-1 text-[11.5px] font-medium text-wisteria"
                >
                  {skillLabel(s)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="accent" onClick={onConfirm} disabled={!canConfirm || confirming}>
          {confirming ? "Searching…" : "Looks good — Find Care"}
        </Button>
        <Button variant="secondary" onClick={onEdit} disabled={confirming}>
          Edit
        </Button>
      </div>
    </Sheet>
  );
}
