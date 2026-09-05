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
      {/* Fluted timber, the panelling behind everything. */}
      <div aria-hidden className="login-flute absolute inset-0" />

      {/* Daylight through a tall window, crossing the room. */}
      <div aria-hidden className="login-shaft absolute inset-0" />

      {/* The pendant lamp, warm and low. */}
      <div aria-hidden className="login-light absolute inset-0" />

      {/* The plan, drawing itself: rooms, a doorway, a table, a rug. */}
      <svg
        aria-hidden
        viewBox="0 0 1200 700"
        preserveAspectRatio="xMidYMid slice"
        className="login-plan absolute inset-0 h-full w-full"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
          <rect x="120" y="90" width="430" height="290" />
          <rect x="550" y="90" width="530" height="290" />
          <rect x="120" y="380" width="960" height="230" />
          {/* a doorway and its swing */}
          <path d="M550 250 h0 M550 190 v60" />
          <path d="M550 250 a60 60 0 0 0 60 -60" />
          {/* a round table and its chairs */}
          <circle cx="800" cy="235" r="52" />
          <circle cx="800" cy="235" r="86" strokeDasharray="4 10" />
          {/* a rug */}
          <rect x="250" y="430" width="380" height="140" strokeDasharray="6 8" />
          {/* setting-out lines */}
          <path d="M120 660 h960 M120 650 v20 M1080 650 v20" />
          <path d="M60 90 v520 M50 90 h20 M50 610 h20" />
        </g>
      </svg>

      {/* Keeps whatever is behind from competing with the type. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-espresso/50 via-transparent to-espresso"
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
            dashboard
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
