"use client";

import { useEffect, useState } from "react";
import { NavGroups } from "@/components/shell/NavGroups";

/**
 * Mobile navigation (below md). The desktop sidebar is a fixed 256px column, so
 * under 768px it is hidden and the same navigation opens here as a slide-over
 * drawer. Self-contained: the trigger and the panel share local state, so no
 * state has to cross the server/client boundary in the shell.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  // Escape closes; while open the page behind must not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded text-secondary transition-colors hover:bg-hover hover:text-white"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          {/* Backdrop — tapping outside closes. */}
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative flex h-full w-64 max-w-[85vw] flex-col gap-6 overflow-y-auto border-r border-brand-line bg-brand px-4 py-6">
            <div className="flex items-center justify-between px-3">
              <span className="font-body text-[10px] font-bold uppercase tracking-[0.22em] text-muted">
                Menu
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-hover hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <NavGroups onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
