export function SelectableCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex flex-col gap-1 rounded-[14px] border p-4 text-left transition-colors ${
        selected
          ? "border-wisteria bg-wisteria-tint"
          : "border-hairline bg-sheet hover:border-wisteria/50"
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold text-ink">{title}</span>
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
            selected ? "border-wisteria bg-wisteria text-sheet" : "border-hairline text-transparent"
          }`}
        >
          ✓
        </span>
      </span>
      {description && <span className="text-[13px] text-ink-muted">{description}</span>}
    </button>
  );
}

export function SelectableChip({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2 text-[13px] font-medium transition-colors ${
        selected
          ? "border-wisteria bg-wisteria text-sheet"
          : "border-hairline bg-sheet text-ink hover:border-wisteria/50"
      }`}
    >
      {label}
    </button>
  );
}
