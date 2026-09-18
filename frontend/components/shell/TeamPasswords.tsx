"use client";

import { useEffect, useState } from "react";

type Colleague = { id: string; name: string; email: string; jobTitle: string | null };

/**
 * A lead resetting a colleague's password — the stand-in for "forgot password"
 * while the portal cannot send email.
 *
 * The button appears only for people who can actually do it. The list is
 * fetched on open rather than on every page load, and it arrives empty for
 * everyone else, so nothing here has to guess at permissions the server has
 * already decided.
 *
 * It shows the new password once, in plain text, and says so. There is no way
 * to read it back afterwards — the database stores a scrypt hash — so a lead
 * who closes this box without passing it on has to do the reset again. Better
 * to say that plainly than to let someone discover it.
 */
export function TeamPasswords() {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Colleague[] | null>(null);
  const [chosen, setChosen] = useState<Colleague | null>(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [allowed, setAllowed] = useState(false);

  // Asked once, on mount: is there anyone this person may reset? The button
  // itself is the answer, so it must not appear before the answer is known.
  useEffect(() => {
    let live = true;
    fetch("/api/auth/team")
      .then((r) => (r.ok ? r.json() : { colleagues: [] }))
      .then((d) => {
        if (!live) return;
        setList(d.colleagues ?? []);
        setAllowed((d.colleagues ?? []).length > 0);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!allowed) return null;

  const close = () => {
    setOpen(false);
    setChosen(null);
    setPw("");
    setError(null);
    setDone(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-brand-ink/25 px-3 py-1 font-body text-[11px] font-bold text-brand-ink/80 transition-colors hover:border-brand-ink/60 hover:text-brand-ink"
      >
        Team
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reset a colleague's password"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 py-16"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-line bg-canvas p-6">
            <h2 className="font-body text-base font-bold text-white">
              Reset a colleague&apos;s password
            </h2>
            <p className="mt-1 font-body text-xs font-light text-secondary">
              For when someone has forgotten theirs. They are signed out everywhere and
              should change it themselves once they are back in.
            </p>

            {done ? (
              <div className="mt-5">
                <p role="status" className="font-body text-xs font-bold text-forest">
                  {done}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-4 rounded border border-line-strong px-4 py-2 font-body text-xs font-light text-secondary transition-colors hover:bg-hover hover:text-white"
                >
                  Close
                </button>
              </div>
            ) : chosen ? (
              <form
                className="mt-5 space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setError(null);
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/auth/team/${chosen.id}/password`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ newPassword: pw }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      setError(data.error ?? "Could not reset that password.");
                      return;
                    }
                    setDone(
                      `${data.name}'s password is set. Tell them: ${pw} — this is the only time it is shown.`,
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <p className="font-body text-sm text-white">{chosen.name}</p>
                <p className="-mt-2 font-body text-[11px] font-light text-muted">
                  {chosen.email}
                </p>

                <div>
                  <label
                    htmlFor="tp-new"
                    className="font-body text-xs font-light text-secondary"
                  >
                    New password — at least 8 characters
                  </label>
                  <input
                    id="tp-new"
                    type="text"
                    required
                    minLength={8}
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    className="mt-1 w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none"
                  />
                  {/* Shown as text, not dots: the lead has to read it out to
                      somebody, and a field they cannot read is a field they
                      will type wrong. */}
                  <p className="mt-1 font-body text-[11px] font-light text-muted">
                    You will need to pass this on — it cannot be read back later.
                  </p>
                </div>

                {error ? (
                  <p role="alert" className="font-body text-xs font-bold text-alert">
                    {error}
                  </p>
                ) : null}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded bg-forest px-4 py-2 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Set password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChosen(null);
                      setPw("");
                      setError(null);
                    }}
                    className="rounded border border-line-strong px-4 py-2 font-body text-xs font-light text-secondary transition-colors hover:bg-hover hover:text-white"
                  >
                    Back
                  </button>
                </div>
              </form>
            ) : (
              <ul className="mt-5 space-y-1">
                {(list ?? []).map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setChosen(c)}
                      className="flex w-full items-center justify-between rounded px-3 py-2.5 text-left transition-colors hover:bg-hover"
                    >
                      <span>
                        <span className="block font-body text-sm text-white">{c.name}</span>
                        <span className="block font-body text-[11px] font-light text-muted">
                          {c.jobTitle ?? c.email}
                        </span>
                      </span>
                      <span className="font-body text-[11px] font-light text-secondary">
                        Reset
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
