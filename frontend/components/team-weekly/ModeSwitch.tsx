"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/components/shell/ThemeToggle";

/**
 * Light | Dark, said in words, for the Team Weekly and 3D boards' header.
 *
 * The shell's ThemeToggle colours itself with brand-ink, which in the light
 * theme is near-black — and these headers are bg-espresso, black in both
 * themes, so in light mode that icon all but disappears. This one is drawn in
 * cream, which reads on espresso whichever theme is on. Same storage key and
 * same data-theme attribute, so the choice carries across every page.
 */

type Theme = "dark" | "light";

export function ModeSwitch() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not remembered in a private window; still applies for this visit.
    }
  }

  return (
    <div role="group" aria-label="Light or dark mode" className="flex rounded border border-cream/30 p-0.5">
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          disabled={theme === null}
          onClick={() => choose(t)}
          className={`rounded-sm px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.14em] transition-colors disabled:opacity-40 ${
            theme === t ? "bg-cream text-espresso" : "text-cream/60 hover:text-cream"
          }`}
        >
          {t === "light" ? "☀ Light" : "☾ Dark"}
        </button>
      ))}
    </div>
  );
}
