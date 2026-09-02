type Tone = "neutral" | "positive" | "attention" | "info";

const tones: Record<Tone, string> = {
  neutral: "bg-wisteria-tint text-wisteria-pressed",
  positive: "bg-success-tint text-[var(--color-success)]",
  attention: "bg-error-tint text-error",
  info: "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
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
