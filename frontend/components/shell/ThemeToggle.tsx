"use client";

import { useEffect, useState } from "react";

/**
 * Light or dark, chosen by the person looking.
 *
 * WHY IT REMEMBERS PER BROWSER AND NOT PER ACCOUNT. Theme is a property of
 * where you are sitting, not of who you are — the same person wants dark at
 * their desk at night and light on a bright meeting-room screen. localStorage
 * is the right size for that, and it costs no request.
 *
 * THE FLASH IS THE HARD PART. Nothing here can run before the first paint, so
 * on its own this would show dark for a moment and then snap to light. The
 * inline script in app/layout.tsx sets data-theme before the page renders; this
 * component only reads back what that script already decided, which is why it
 * starts as null and renders a stable placeholder until mounted.
 */

type Theme = "dark" | "light";

export const THEME_KEY = "essentia-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setTheme(attr === "light" ? "light" : "dark");
  }, []);

  function choose(next: Theme) {
    document.documentElement.setAttribute("data-theme", next);
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private windows and locked-down browsers throw on write. The theme
      // still applies for this visit; it simply will not be remembered, which
      // is a smaller failure than not switching at all.
    }
  }

  const label = theme === "light" ? "Switch to dark" : "Switch to light";

  return (
    <button
      type="button"
      // Before mount the theme is unknown, so the button is inert rather than
      // guessing — a control that flips the wrong way once is worse than one
      // that waits a frame.
      disabled={theme === null}
      onClick={() => choose(theme === "light" ? "dark" : "light")}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded border border-cream/20 text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream disabled:opacity-40 ${className}`}
    >
      {/* Sun when the page is dark (what you would switch to), moon when it is
          light. The icon names the destination, not the current state — that is
          the reading people actually apply to a toggle. */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        {theme === "light" ? (
          <path
            d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </>
        )}
      </svg>
    </button>
  );
}
