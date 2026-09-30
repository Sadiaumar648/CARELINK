"use client";

import { Sun, Moon } from "@phosphor-icons/react";
import { useTheme, type Theme } from "@/lib/theme/theme-context";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

// A compact Light/Dark segmented control, sized to sit inside a profile
// dropdown (components/{parent,staff,admin}/header-profile.tsx) — the
// one place Settings already lives for every role, so this is the
// natural home for an app-wide appearance choice rather than a fourth
// near-identical settings page per role.
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="px-4 py-2">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        Appearance
      </p>
      <div className="flex gap-1.5">
        {OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = theme === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-pressed={active}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-2 py-1.5 text-[12.5px] font-medium transition-colors ${
                active
                  ? "border-wisteria bg-wisteria-tint text-wisteria"
                  : "border-hairline text-ink-muted hover:text-ink"
              }`}
            >
              <Icon size={14} weight={active ? "fill" : "regular"} />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
