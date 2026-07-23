"use client";

import { useEffect, useState } from "react";

/**
 * Role-first greeting for the CRM TL Dashboard (S2) — "Good morning, {name}.
 * {date} · N active projects". Time-of-day and date are computed on the client
 * (the viewer's local clock), so the server renders a neutral "Hello" first to
 * avoid a hydration mismatch, then it settles to the real greeting on mount.
 */
export function GreetingHeader({ name, activeProjects }: { name: string; activeProjects: number }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const first = name.split(" ")[0] || name;
  const hour = now?.getHours();
  const part = hour == null ? null : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const greeting = part ? `Good ${part}` : "Hello";
  const dateStr = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    : null;

  return (
    <div>
      <h1 className="mb-1 font-heading text-4xl text-white">
        {greeting}, {first}.
      </h1>
      <p className="font-body text-sm font-light text-muted">
        {dateStr ? `${dateStr} · ` : ""}
        {activeProjects} active project{activeProjects === 1 ? "" : "s"}
      </p>
    </div>
  );
}
