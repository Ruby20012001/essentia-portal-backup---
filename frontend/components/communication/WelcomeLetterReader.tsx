"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { WelcomeLetter } from "@/lib/services/welcome-letter";

/**
 * The TL read gate (CLAUDE.md, permanent constraint): the send button does not
 * activate until the reader has scrolled to the bottom of the letter.
 *
 * The scroll is detected here and confirmed to the server, which stores it. The
 * server refuses to send without it regardless of what this component does — so
 * this is the humane half of the gate, not the enforcing half.
 */
export function WelcomeLetterReader({ letter }: { letter: WelcomeLetter }) {
  const router = useRouter();
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(letter.status !== "draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyRead = letter.status !== "draft";
  const sent = letter.status === "sent";

  // Detect arrival at the bottom, and handle the case where the letter is
  // shorter than its own container — a short letter is fully read on sight.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || alreadyRead) return;

    const check = () => {
      const reachedEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      if (reachedEnd) setAtBottom(true);
    };

    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [alreadyRead]);

  async function post(path: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That could not be recorded.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("That could not be recorded — the portal is unreachable.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-card">
      <div className="border-b border-line px-5 py-3">
        <p className="font-body text-sm text-white">
          {letter.familyName} · {letter.projectCode}
        </p>
        <p className="mt-0.5 font-body text-xs font-light text-muted">
          Welcome Letter · {letter.channel}
          {letter.draftedAt ? ` · drafted ${letter.draftedAt.slice(0, 16).replace("T", " ")}` : ""}
        </p>
      </div>

      {/* The letter. Deliberately scrollable — reaching the end is the gate. */}
      <div
        ref={bodyRef}
        tabIndex={0}
        aria-label="Welcome Letter body — scroll to the end to enable sending"
        className="max-h-72 overflow-y-auto px-5 py-4 focus:outline-none focus-visible:ring-1 focus-visible:ring-white"
      >
        <p className="whitespace-pre-wrap font-body text-sm font-light leading-relaxed text-secondary">
          {letter.body}
        </p>
      </div>

      <div className="border-t border-line px-5 py-3">
        {sent ? (
          <p className="font-body text-xs font-bold text-success">
            Sent{letter.sentAt ? ` ${letter.sentAt.slice(0, 16).replace("T", " ")}` : ""}
            {letter.reviewedBy ? ` · read by ${letter.reviewedBy}` : ""}
          </p>
        ) : (
          <>
            <p
              className={`mb-2 font-body text-xs font-light ${atBottom ? "text-success" : "text-warning"}`}
              role="status"
            >
              {atBottom
                ? alreadyRead
                  ? `Read to the end${letter.reviewedBy ? ` by ${letter.reviewedBy}` : ""} — sending is open.`
                  : "You have reached the end. Confirm you have read it, then send."
                : "Scroll to the end of the letter. The send button opens once you have."}
            </p>

            <div className="flex flex-wrap gap-2">
              {!alreadyRead ? (
                <button
                  type="button"
                  disabled={!atBottom || busy}
                  onClick={() => post(`/api/communication/letters/${letter.id}/read`)}
                  className="rounded border border-line-strong bg-surface px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover focus:border-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? "Recording…" : "I have read this letter"}
                </button>
              ) : null}

              <button
                type="button"
                disabled={!alreadyRead || busy}
                onClick={() => post(`/api/communication/letters/${letter.id}/send`)}
                className="rounded border border-line-strong bg-surface px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-hover focus:border-white focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                title={alreadyRead ? undefined : "Read the letter to the end first"}
              >
                {busy ? "Sending…" : "Send to family"}
              </button>
            </div>
          </>
        )}

        {error ? (
          <p role="alert" className="mt-2 font-body text-[11px] font-bold text-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
