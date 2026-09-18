"use client";

import { useState } from "react";

/**
 * Change-your-own-password, in the header rather than on a page of its own.
 *
 * A page would need a route, and a tracker-only deployment serves a deliberately
 * short list of them (lib/portal-mode.ts) — so a /account page would have to be
 * added to that list, in a file whose whole point is to stay small. The header
 * is already on every screen this deployment serves, which is exactly where
 * someone looks for their own name.
 *
 * The panel says what it will do before it does it: changing the password signs
 * you out everywhere else. People change a password when they think somebody has
 * it, and a change that quietly left the other sessions open would fail at the
 * one moment it is needed.
 */
export function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setCurrent("");
    setNext("");
    setAgain("");
    setError(null);
    setDone(null);
  };

  const field =
    "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-brand-ink/25 px-3 py-1 font-body text-[11px] font-bold text-brand-ink/80 transition-colors hover:border-brand-ink/60 hover:text-brand-ink"
      >
        Reset password
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reset your password"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-sm rounded-lg border border-line bg-canvas p-6">
            <h2 className="font-body text-base font-bold text-white">Reset your password</h2>
            <p className="mt-1 font-body text-xs font-light text-secondary">
              You will stay signed in here. Every other device is signed out.
            </p>

            <form
              className="mt-5 space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setError(null);

                // Checked here as well as on the server, because the server
                // never sees this field — it is the person's own typing, not a
                // rule about the account.
                if (next !== again) {
                  setError("The two new passwords do not match.");
                  return;
                }

                setBusy(true);
                try {
                  const res = await fetch("/api/auth/password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ currentPassword: current, newPassword: next }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(data.error ?? "Could not reset the password.");
                    return;
                  }
                  setDone(
                    data.otherSessionsEnded > 0
                      ? `Password reset. ${data.otherSessionsEnded} other session${
                          data.otherSessionsEnded === 1 ? " was" : "s were"
                        } signed out.`
                      : "Password reset.",
                  );
                  setCurrent("");
                  setNext("");
                  setAgain("");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div>
                <label htmlFor="cp-current" className="font-body text-xs font-light text-secondary">
                  Current password
                </label>
                <input
                  id="cp-current"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  className={`mt-1 ${field}`}
                />
              </div>

              <div>
                <label htmlFor="cp-new" className="font-body text-xs font-light text-secondary">
                  New password — at least 8 characters
                </label>
                <input
                  id="cp-new"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className={`mt-1 ${field}`}
                />
              </div>

              <div>
                <label htmlFor="cp-again" className="font-body text-xs font-light text-secondary">
                  New password again
                </label>
                <input
                  id="cp-again"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={again}
                  onChange={(e) => setAgain(e.target.value)}
                  className={`mt-1 ${field}`}
                />
              </div>

              {error ? (
                <p role="alert" className="font-body text-xs font-bold text-alert">
                  {error}
                </p>
              ) : null}

              {done ? (
                <p role="status" className="font-body text-xs font-bold text-forest">
                  {done}
                </p>
              ) : null}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded bg-forest px-4 py-2 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Reset password"}
                </button>
                <button
                  type="button"
                  onClick={close}
                  className="rounded border border-line-strong px-4 py-2 font-body text-xs font-light text-secondary transition-colors hover:bg-hover hover:text-white"
                >
                  {done ? "Close" : "Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
