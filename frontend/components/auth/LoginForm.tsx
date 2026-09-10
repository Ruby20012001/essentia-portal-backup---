"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { homeHref, isRouteAllowed } from "@/lib/portal-mode";

export function LoginForm({
  next,
  showDevHint,
}: {
  next?: string;
  showDevHint: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const inputClass =
    "w-full rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-white focus:border-white focus:outline-none";

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(data.error ?? "Sign-in failed");
            return;
          }
          // Where "home" is depends on what this deployment serves — a
          // tracker-only build has no dashboard, and sending someone there
          // after a correct sign-in greets them with a render error.
          const target =
            next && next.startsWith("/") && isRouteAllowed(next)
              ? next
              : homeHref();
          router.push(target);
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? (
        <p
          role="alert"
          className="mb-3 rounded border-l-4 border-alert bg-alert/5 px-3 py-2 font-body text-xs font-bold text-alert"
        >
          {error}
        </p>
      ) : null}

      <label className="mb-3 block">
        <span className="mb-1 block font-body text-xs font-bold text-label">Email</span>
        <input
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="mb-5 block">
        <span className="mb-1 block font-body text-xs font-bold text-label">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded border border-line-strong bg-canvas px-5 py-2.5 font-body text-sm font-bold text-white transition-colors hover:bg-hover disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>

      {showDevHint ? (
        <p className="mt-4 text-center font-body text-[11px] font-light text-label">
          Dev: dev.crmtl@essentia.in · essentia-dev-2026
        </p>
      ) : null}
    </form>
  );
}
