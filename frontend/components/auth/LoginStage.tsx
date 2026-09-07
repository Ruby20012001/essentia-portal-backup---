"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

/**
 * The sign-in page as a short sequence rather than a static panel.
 *
 *   the wordmark alone  →  a wipe  →  the form
 *
 * Ruby, 2026-09-03: no photograph, something drawn, and something that belongs
 * to interior design rather than to software.
 *
 * WHY IT IS DRAWN AND NOT PHOTOGRAPHED. A render is one project, and this page
 * belongs to all of them; it also costs a download before anyone can type. The
 * background here is a plan — the thing an interior designer actually makes —
 * drawn line by line in the brand's own colours, and it weighs nothing.
 *
 * THE INTRO IS 1.4 SECONDS AND NEVER BLOCKS. The form is rendered from the
 * first frame and simply covered; a person who starts typing during the wipe
 * loses nothing, because the field is already there and already focusable. An
 * intro that made someone wait would be charming once and irritating every day
 * after.
 *
 * REDUCED MOTION SKIPS ALL OF IT. Someone who has asked their system for less
 * movement gets the finished page immediately — no wipe, no drifting light, no
 * drawing. That is a real setting used by real people, not a checkbox.
 */

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function LoginStage({
  entraConfigured,
  devLogin,
  next,
  error,
}: {
  entraConfigured: boolean;
  devLogin: boolean;
  next?: string;
  error?: string;
}) {
  // Both start in the state that needs no clock and no measurement, so the
  // server's HTML and the browser's first render agree. The greeting depends on
  // the reader's own time of day, which the server cannot know — rendering a
  // guess would mean a visible correction a moment later.
  const [revealed, setRevealed] = useState(false);
  const [hello, setHello] = useState<string | null>(null);

  useEffect(() => {
    setHello(greeting(new Date().getHours()));

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) {
      setRevealed(true);
      return;
    }
    const t = window.setTimeout(() => setRevealed(true), 1400);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-espresso px-6">
      {/* The room. It drifts, very slowly — a still photograph on a login
          screen reads as a poster; a moving one reads as a place. */}
      <div
        aria-hidden
        className="login-photo absolute inset-0 bg-[url('/brand/login.jpg')] bg-cover bg-center"
      />

      {/* The bedside lamp, breathing. A photograph cannot dim its own light,
          so the glow sits over where the lamp actually is and does the
          brightening instead — the room reads as lit rather than printed. */}
      <div aria-hidden className="login-lamp absolute inset-0" />

      {/* Warmth of the brand over whatever the photograph is doing. */}
      <div aria-hidden className="login-light absolute inset-0" />

      {/* Keeps whatever is behind from competing with the type. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-espresso/40 via-transparent to-espresso/90"
      />

      <div
        className={`relative w-full max-w-sm rounded-lg border border-cream/10 bg-card/85 px-8 py-10 shadow-2xl backdrop-blur-md transition-all duration-700 ${
          revealed ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <div className="mb-7 flex flex-col items-center">
          <Image
            src="/brand/logo-dark.png"
            alt="essentia"
            height={22}
            width={112}
            priority
          />
          <p className="mt-3 font-body text-[10px] font-light uppercase tracking-[0.3em] text-label">
            sign in page
          </p>
        </div>

        <div className="mb-6">
          {/* Reserves its line before the clock is read, so nothing shifts. */}
          <p className="font-body text-lg font-light text-white">{hello ?? " "}</p>
          <p className="mt-1 font-body text-xs font-light text-secondary">
            Sign in with your email
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mb-4 rounded border-l-4 border-alert bg-alert/5 px-3 py-2 font-body text-xs font-bold text-alert"
          >
            {error}
          </p>
        ) : null}

        {/* One way in. Staff accounts carry no password (db/035, auth_provider
            'entra'), so offering the password form alongside would be a dead
            control: someone types their email, fails, and concludes the portal
            is broken. The form stays as the break-glass path for when Entra is
            not configured — a deployment with no tenant must still be
            reachable. */}
        {entraConfigured ? (
          <a
            href="/api/auth/entra/start"
            className="block rounded bg-navy px-5 py-2.5 text-center font-body text-sm font-bold text-cream transition-opacity hover:opacity-90"
          >
            Sign in with Microsoft
          </a>
        ) : (
          <LoginForm next={next} showDevHint={devLogin} />
        )}
        {/* Sign-in codes are gone from this page, 2026-09-07. They were never
            delivered: essentia.in publishes a DMARC policy and Brevo was not
            authenticated in its DNS, so every code was refused at the door.
            Ruby's call was to stop waiting on IT and sign in with passwords.

            A "Forgot password?" that starts a flow which cannot finish is worse
            than no link at all — it teaches people the page is broken. So the
            recovery path is a person, and it says so. */}
        <p className="mt-5 border-t border-line pt-4 font-body text-[11px] font-light leading-relaxed text-muted">
          Forgot your password? Ask your team lead to set a new one for you.
        </p>
      </div>

      <p className="absolute bottom-6 font-body text-[10px] font-light tracking-[0.2em] text-cream/25">
        ESSENTIA GROUP
      </p>

      {/* The intro. Sits on top, then leaves — it never holds the form back. */}
      <div
        aria-hidden
        className={`login-intro absolute inset-0 flex items-center justify-center bg-espresso ${
          revealed ? "login-intro--gone" : ""
        }`}
      >
        <Image
          src="/brand/logo-dark.png"
          alt=""
          height={30}
          width={153}
          priority
          className="login-mark"
        />
      </div>
    </div>
  );
}
