import type { Icon } from "@phosphor-icons/react";
import { ReactNode } from "react";

const ICON_TONE = {
  wisteria: "bg-wisteria-tint text-wisteria-pressed",
  bluebell: "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
} as const;

export function EmptyState({
  icon: IconComponent,
  title,
  description,
  action,
  tone = "wisteria",
}: {
  icon: Icon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: keyof typeof ICON_TONE;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-hairline bg-sheet p-8 text-center">
      <span
        className={`flex h-11 w-11 items-center justify-center rounded-full ${ICON_TONE[tone]}`}
      >
        <IconComponent size={22} weight="duotone" />
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="max-w-xs text-[13px] text-ink-muted">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[18px] border border-hairline bg-sheet p-8 text-center">
      <p className="text-[15px] font-semibold text-ink">Something went wrong</p>
      <p className="max-w-xs text-[13px] text-ink-muted">
        We couldn&apos;t load your CareLink dashboard. Please try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[10px] bg-wisteria px-4 py-2 text-[13px] font-semibold text-sheet hover:bg-wisteria-hover"
      >
        Try Again
      </button>
    </div>
  );
}
