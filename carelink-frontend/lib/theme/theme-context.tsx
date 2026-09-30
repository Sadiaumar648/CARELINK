"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "carelink-theme";

type ThemeState = {
  // The theme actually being rendered right now — resolved from the
  // stored explicit choice if one exists, otherwise from the OS's own
  // prefers-color-scheme (see the inline script in app/layout.tsx,
  // which applies this before first paint so there's no flash).
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeState | null>(null);

function systemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Matches whatever the inline pre-paint script in app/layout.tsx
  // already stamped onto <html data-theme>, so this never causes a
  // second, visible flip right after hydration.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof document === "undefined") return "light";
    const stamped = document.documentElement.dataset.theme;
    return stamped === "dark" || stamped === "light" ? stamped : systemTheme();
  });

  useEffect(() => {
    // No explicit choice saved yet — keep following the OS setting live
    // (the CSS media query already does this for colors; this keeps
    // this context's own value in sync too, e.g. for a toggle's label).
    if (localStorage.getItem(STORAGE_KEY)) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      setThemeState(media.matches ? "dark" : "light");
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function setTheme(next: Theme) {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
