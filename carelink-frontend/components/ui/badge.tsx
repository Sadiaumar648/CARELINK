import { SealCheck } from "@phosphor-icons/react/dist/ssr";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "peach" | "gold";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-sage-tint text-sage-pressed",
    peach: "bg-peach-tint text-[#8a4a30]",
    gold: "bg-gold-tint text-[#7a5a1e]",
  };
  return (
    <span
      className={`inline-block rounded-full px-3 py-1 text-[12px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Only ever reflects the backend's real verification_status — never
// shown unless the account is actually verified.
export function VerificationBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-3 py-1 text-[12px] font-semibold text-[var(--color-success)]">
      <SealCheck size={14} weight="fill" />
      Verified
    </span>
  );
}
