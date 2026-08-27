"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SpeakerHigh, SpeakerSlash } from "@phosphor-icons/react";

const STORAGE_KEY = "carelink-read-aloud";

// App Flow doc task 4.6: read the screen aloud on arrival, for a
// caregiver who's more comfortable listening than reading small text
// while on the move. Opt-in and remembered, not forced on every visit.
export function ReadAloudToggle() {
  const pathname = usePathname();
  // Lazy initializers, not an effect: reading window/localStorage here
  // runs once during the client's first render rather than after mount,
  // so there's no synchronous setState-in-effect for the linter to flag,
  // and no flash from false -> the real value either.
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!enabled || !supported) return;
    const heading = document.querySelector("h1")?.textContent;
    if (!heading) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(heading));
  }, [enabled, supported, pathname]);

  if (!supported) return null;

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (!next) window.speechSynthesis.cancel();
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // best-effort only
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={enabled ? "Turn off reading screens aloud" : "Read screens aloud"}
      aria-pressed={enabled}
      className="flex min-h-[52px] min-w-[52px] items-center justify-center rounded p-2 text-ink-muted hover:text-ink"
    >
      {enabled ? <SpeakerHigh size={22} weight="duotone" /> : <SpeakerSlash size={22} />}
    </button>
  );
}
