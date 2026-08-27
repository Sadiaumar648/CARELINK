// A simple, flat illustration of a caregiver holding a child — built
// from plain circles/rects rather than a stock photo, since sourcing a
// real photo of a real person isn't something to do without a clear
// license, and there's no image-generation tool available here.
export function HeroIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      role="img"
      aria-label="An illustration of a caregiver holding a child"
    >
      <circle cx="200" cy="200" r="190" fill="var(--color-sheet)" />

      {/* decorative dots */}
      <circle cx="95" cy="90" r="10" fill="var(--color-cyan)" opacity="0.35" />
      <circle cx="320" cy="120" r="14" fill="var(--color-magenta)" opacity="0.3" />
      <circle cx="335" cy="230" r="8" fill="var(--color-cyan)" opacity="0.3" />
      <circle cx="70" cy="260" r="12" fill="var(--color-magenta)" opacity="0.3" />

      {/* caregiver: seated body */}
      <rect x="100" y="190" width="160" height="150" rx="55" fill="var(--color-cyan)" />
      <rect x="108" y="238" width="36" height="82" rx="18" fill="var(--color-cyan)" />
      <rect x="256" y="242" width="36" height="80" rx="18" fill="var(--color-cyan)" />

      {/* caregiver: head */}
      <ellipse cx="180" cy="124" rx="58" ry="48" fill="#3d2b1f" />
      <circle cx="180" cy="148" r="46" fill="#d9a066" />
      <circle cx="165" cy="148" r="4" fill="var(--color-ink)" />
      <circle cx="195" cy="148" r="4" fill="var(--color-ink)" />
      <path
        d="M165 165 Q180 176 195 165"
        stroke="var(--color-ink)"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
      />

      {/* child: wrapped, in the caregiver's lap */}
      <ellipse cx="235" cy="286" rx="58" ry="52" fill="var(--color-magenta)" />

      {/* child: head */}
      <ellipse cx="235" cy="248" rx="32" ry="27" fill="#2a1d14" />
      <circle cx="235" cy="263" r="27" fill="#e8b587" />
      <circle cx="225" cy="263" r="3" fill="var(--color-ink)" />
      <circle cx="245" cy="263" r="3" fill="var(--color-ink)" />
      <path
        d="M223 273 Q235 281 247 273"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
