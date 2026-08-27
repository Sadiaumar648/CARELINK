type Tone = "neutral" | "positive" | "attention";

const tones: Record<Tone, string> = {
  neutral: "bg-hairline/40 text-ink-muted",
  positive: "bg-cyan/10 text-cyan-pressed",
  attention: "bg-magenta/10 text-magenta",
};

// Status is always a word plus a tint, never color alone (Design Brief §2).
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-block rounded px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
