// A simple shield-and-checkmark illustration for the safety section —
// same reasoning as HeroIllustration: no verified photo source
// available, so a plain geometric illustration in the site's own
// palette stands in.
export function TrustIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      role="img"
      aria-label="An illustration representing safety and verification"
    >
      <circle cx="200" cy="200" r="190" fill="var(--color-sheet)" />

      <circle cx="90" cy="100" r="8" fill="var(--color-gold)" opacity="0.35" />
      <circle cx="315" cy="290" r="10" fill="var(--color-peach)" opacity="0.4" />

      <path
        d="M200 80 L300 118 V200 C300 265 258 310 200 330 C142 310 100 265 100 200 V118 Z"
        fill="var(--color-sage)"
      />
      <path
        d="M200 105 L278 135 V200 C278 253 244 289 200 305 C156 289 122 253 122 200 V135 Z"
        fill="var(--color-sage-hover)"
      />
      <path
        d="M160 200 L188 228 L244 168"
        stroke="var(--color-sheet)"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
