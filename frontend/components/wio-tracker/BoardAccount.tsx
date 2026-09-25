"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Who is looking, and the way out — in the corner of the open board.
 *
 * Ruby, 2026-09-07: she was on the board as a viewer and had no way to become
 * an editor, because there was nothing on the page that said she was signed in
 * at all, let alone offered to end it. One link for everyone only works if
 * swapping who you are is on that link too.
 *
 * Signing out refreshes rather than navigating: the session cookie is gone, so
 * the same URL re-renders as the open board. Nobody is thrown to a login screen
 * they did not ask for.
 */
export function BoardAccount({
  name,
  next = "/board",
  solid = false,
}: {
  name: string | null;
  /** Where to come back to after signing in — the design board reuses this. */
  next?: string;
  /**
   * Draw the sign-in as a filled button rather than an outline. The design
   * board asked for it (Monica, 25 Sep: "sign ka button lagado Vishakha
   * par"): that page is read by four people who have to sign in to do their
   * work, so the way in should look like the thing to press. The WIO board
   * is read by most of essentia and edited by six, so an outline is right
   * there — it stays the default.
   */
  solid?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!name) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(next)}`}
        className={
          solid
            ? "rounded bg-cream px-4 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-espresso transition-colors hover:bg-white"
            : "rounded border border-cream/20 px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream"
        }
      >
        Sign in to edit
      </a>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-body text-[11px] font-light text-cream/60 sm:inline">
        {name}
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-cream/20 px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.14em] text-cream/70 transition-colors hover:bg-cream/10 hover:text-cream disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
