type Tone = "neutral" | "positive" | "attention";

const tones: Record<Tone, string> = {
  neutral: "bg-[var(--color-neutral-tint)] text-cyan-pressed",
  positive: "bg-[var(--color-success-tint)] text-[var(--color-success)]",
  attention: "bg-[var(--color-attention-tint)] text-magenta",
};

// Status is always a word plus a tint, never color alone.
export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] ${tones[tone]}`}
    >
      {label}
    </span>
  );
}
