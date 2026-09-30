"use client";

import { useEffect, useState } from "react";

/**
 * Where to go from the design board, in a card that slides in from the side.
 *
 * Monica, 25 Sep: "mobile card ki tarah side me aana chahiye — Dashboard,
 * Tracker aur Concept deck, aur same process sabke me." The top bar had these
 * as a row of words and it was the wrong shape: on the head's board two of
 * them pointed at the page you were already on, and on a phone the row had
 * nowhere to sit. A drawer says the same thing without taking the board's
 * width, and it is the shell's own pattern (components/shell/MobileNav).
 *
 * At every width, not only on a phone. The board is a wide table people read
 * across; a permanent column beside it would cost the thing they came for.
 *
 * SIGNED OUT THERE IS NO BUTTON. Everywhere it would lead — the portal's
 * tracker, the deck list — asks for an account, so offering them to somebody
 * with no session is offering a refusal.
 */
export function DesignBoardMenu({
  items,
}: {
  items: { label: string; href: string; here?: boolean; apart?: boolean }[];
}) {
  const [open, setOpen] = useState(false);

  // Escape closes; while it is open the board behind must not scroll.
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

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the menu"
        aria-expanded={open}
        className="flex h-8 w-8 items-center justify-center rounded text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Tapping the board behind closes it. */}
          <button
            type="button"
            aria-label="Close the menu"
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
                aria-label="Close the menu"
                className="flex h-7 w-7 items-center justify-center rounded text-secondary transition-colors hover:bg-hover hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="space-y-0.5">
              {items.map((item) => (
                /* apart: the way in, not a place to go — under a line of
                   its own so it does not read as a fifth room. */
                <li
                  key={item.href}
                  className={item.apart ? "mt-4 border-t border-brand-line pt-4" : undefined}
                >
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={item.here ? "page" : undefined}
                    className={`block rounded px-3 py-2 font-body text-sm transition-colors ${
                      item.here
                        ? "bg-selected font-normal text-white"
                        : "font-light text-secondary hover:bg-hover hover:text-white"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
