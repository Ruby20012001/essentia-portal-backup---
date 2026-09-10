"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { homeHref, isRouteAllowed } from "@/lib/portal-mode";

/**
 * Signing in with a code instead of a password.
 *
 * Two steps in one place — ask for the code, then type it — because the address
 * typed in the first step is the one the second needs, and making the person
 * type it twice is how they end up asking for a code for one address and
 * answering for another.
 *
 * The screen never says whether the account exists: "if that address has an
 * account, a code is on its way" is the same sentence either way. The server
 * behaves the same; this only has to avoid undoing that.
 */
export function CodeSignIn({ next, onCancel }: { next?: string; onCancel: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field =
    "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none";

  async function post(body: Record<string, string>) {
    const res = await fetch("/api/auth/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await res.json().catch(() => ({})) };
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setBusy(true);
        try {
          if (step === "email") {
            const { res, data } = await post({ step: "send", email });
            if (!res.ok) {
              setError(data.error ?? "Could not send a code.");
              return;
            }
            setStep("code");
            return;
          }

          const { res, data } = await post({ step: "verify", email, code });
          if (!res.ok) {
            setError(data.error ?? "That code is not right.");
            return;
          }
          router.push(
            next && next.startsWith("/") && isRouteAllowed(next) ? next : homeHref(),
          );
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {step === "email" ? (
        <>
          <div>
            <label htmlFor="c-email" className="font-body text-xs font-light text-secondary">
              Your email
            </label>
            <input
              id="c-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mt-1 ${field}`}
            />
          </div>
          <p className="font-body text-[11px] font-light leading-relaxed text-muted">
            We will send a six-digit code. It works once and lasts ten minutes.
          </p>
        </>
      ) : (
        <>
          <p className="font-body text-xs font-light leading-relaxed text-secondary">
            If <span className="text-white">{email}</span> has an account, a code is on its
            way. Check the inbox — and the spam folder the first time.
          </p>
          <div>
            <label htmlFor="c-code" className="font-body text-xs font-light text-secondary">
              Six-digit code
            </label>
            <input
              id="c-code"
              // Numeric and one-time-code, so phones offer the code from the
              // notification instead of making someone switch apps to read it.
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`mt-1 ${field} text-center text-lg tracking-[0.5em]`}
            />
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="font-body text-xs font-bold text-alert">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded bg-forest px-5 py-2.5 font-body text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : step === "email" ? "Send me a code" : "Sign in"}
      </button>

      <button
        type="button"
        onClick={() => (step === "code" ? setStep("email") : onCancel())}
        className="w-full font-body text-[11px] font-light text-secondary underline decoration-line-strong underline-offset-2 transition-colors hover:text-white"
      >
        {step === "code" ? "Use a different email" : "Sign in with a password instead"}
      </button>
    </form>
  );
}
