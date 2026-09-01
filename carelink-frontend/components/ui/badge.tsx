import { SealCheck } from "@phosphor-icons/react/dist/ssr";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "peach" | "gold" | "bluebell";
}) {
  const tones: Record<string, string> = {
    neutral: "bg-sage-tint text-sage-pressed",
    peach: "bg-peach-tint text-[var(--color-error)]",
    gold: "bg-gold-tint text-[var(--color-gold)]",
    bluebell: "bg-bluebell-tint text-[var(--color-bluebell-pressed)]",
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
// shown unless the account is actually verified. `method`, when known
// (users.verification_method — carelink or agency), makes the label
// specific rather than a bare "Verified", so the UI never implies a
// CareLink document review happened when the account was actually
// verified by the agency directly. Omitting it (every call site that
// predates verification_method) keeps the original generic label.
export function VerificationBadge({ method }: { method?: "carelink" | "agency" | null }) {
  const label =
    method === "carelink"
      ? "Verified by CareLink"
      : method === "agency"
        ? "Verified by Agency"
        : "Verified";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-3 py-1 text-[12px] font-semibold text-[var(--color-success)]">
      <SealCheck size={14} weight="fill" />
      {label}
    </span>
  );
}
