"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateStatus, Colleague, Scorecard } from "@/lib/services/hiring";

/**
 * The small pieces every hiring screen shares.
 *
 * `Notice` exists because of one finding in particular: every refusal used to
 * print at the top of the page, far above the button that was pressed, so a
 * refused "Add to the board" looked like a dead button. A form now shows its
 * own message next to its own button.
 */

export const inputClass =
  "w-full rounded-lg border border-line bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted";

export const primaryClass =
  "rounded-lg bg-forest px-4 py-2 font-body text-sm font-bold text-cream hover:bg-forest/90 disabled:opacity-40";

export const ghostClass =
  "rounded-lg border border-line px-3 py-2 font-body text-sm font-bold text-white hover:bg-hover disabled:opacity-40";

export const dangerClass =
  "rounded-lg border border-alert/40 px-3 py-2 font-body text-sm font-bold text-alert hover:bg-alert/5 disabled:opacity-40";

export const pillClass =
  "rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block first:mt-0">
      <span className="mb-1 block font-body text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block font-body text-xs font-light text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export type NoticeState = { tone: "error" | "success"; message: string } | null;

/** A message where the person is looking. Scrolls itself into view when it appears. */
export function Notice({ notice }: { notice: NoticeState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (notice) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [notice]);
  if (!notice) return null;
  return (
    <div
      ref={ref}
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mt-3 rounded-lg border-l-4 px-4 py-2.5 font-body text-sm ${
        notice.tone === "error"
          ? "border-alert bg-alert/5 text-alert"
          : "border-forest bg-forest/5 text-success"
      }`}
    >
      {notice.message}
    </div>
  );
}

export type SendResult<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  data: T & { error?: string };
};

/** JSON in, JSON out, never throws — the caller decides what a refusal looks like. */
export async function sendJson<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "PUT",
  body: unknown,
): Promise<SendResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok && !data.error) {
      (data as { error?: string }).error = `That did not go through (${res.status}).`;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: "The portal could not be reached. Check the connection and try again." } as T & {
        error?: string;
      },
    };
  }
}

const STATUS_TONE: Record<CandidateStatus, string> = {
  active: "bg-white/5 text-muted",
  offered: "bg-success/10 text-success",
  hired: "bg-success/15 text-success",
  rejected: "bg-alert/10 text-alert",
  withdrawn: "bg-amber/10 text-amber-deep",
};

/** Nothing is shown for `active` — that is the ordinary state and the stage says it. */
export function CandidateStatusPill({ status }: { status: CandidateStatus }) {
  if (status === "active") return null;
  return <span className={`${pillClass} ${STATUS_TONE[status]}`}>{status}</span>;
}

export function RecommendationPill({ call }: { call: Scorecard["recommendation"] }) {
  if (!call) return <span className={`${pillClass} bg-white/5 text-muted`}>no call</span>;
  const yes = call === "yes" || call === "strong_yes";
  return (
    <span className={`${pillClass} ${yes ? "bg-success/10 text-success" : "bg-alert/10 text-alert"}`}>
      {call.replace("_", " ")}
    </span>
  );
}

/**
 * Picking colleagues. `multiple` builds a panel (the first name leads);
 * otherwise it picks one person, e.g. a seat's hiring lead. "Add me" is there
 * because the HR person scheduling a first call is usually the one holding it.
 */
export function ColleaguePicker({
  value,
  onChange,
  viewer,
  multiple = true,
  placeholder = "Type at least two letters of a name or email",
}: {
  value: Colleague[];
  onChange: (next: Colleague[]) => void;
  viewer?: { id: string; name: string };
  multiple?: boolean;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Colleague[]>([]);
  const [searched, setSearched] = useState(false);

  async function lookUp(q: string) {
    setSearch(q);
    if (q.trim().length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    const res = await fetch(`/api/hiring/colleagues?q=${encodeURIComponent(q)}`).catch(() => null);
    if (res?.ok) {
      setResults(((await res.json()) as { users: Colleague[] }).users);
      setSearched(true);
    }
  }

  function add(person: Colleague) {
    if (multiple) {
      onChange(value.some((p) => p.id === person.id) ? value : [...value, person]);
    } else {
      onChange([person]);
    }
    setSearch("");
    setResults([]);
    setSearched(false);
  }

  const viewerAdded = viewer ? value.some((p) => p.id === viewer.id) : true;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => void lookUp(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the first match. Left alone it submitted the whole
            // interview form, without the person being searched for.
            if (e.key === "Enter") {
              e.preventDefault();
              if (results[0]) add(results[0]);
            }
          }}
          className={`${inputClass} min-w-0 flex-1`}
          placeholder={placeholder}
        />
        {viewer && !viewerAdded ? (
          <button
            type="button"
            className={ghostClass}
            onClick={() => add({ id: viewer.id, name: viewer.name, email: "", jobTitle: null })}
          >
            Add me
          </button>
        ) : null}
      </div>

      {results.length > 0 ? (
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
          {results.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => add(person)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-hover"
              >
                <span className="font-body text-sm text-white">{person.name}</span>
                <span className="truncate font-body text-xs text-muted">
                  {person.jobTitle ?? person.email}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched ? (
        <p className="mt-2 font-body text-xs text-muted">Nobody matches — try part of the email address.</p>
      ) : search.trim().length > 0 && search.trim().length < 2 ? (
        <p className="mt-2 font-body text-xs text-muted">Keep typing…</p>
      ) : null}

      {value.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {value.map((person, index) => (
            <li
              key={person.id}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1"
            >
              <span className="font-body text-xs text-white">
                {person.name}
                {multiple && index === 0 && value.length > 1 ? " · leads" : ""}
              </span>
              <button
                type="button"
                aria-label={`Remove ${person.name}`}
                onClick={() => onChange(value.filter((p) => p.id !== person.id))}
                className="font-body text-xs text-muted hover:text-alert"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : search.trim().length >= 2 ? (
        <p className="mt-2 font-body text-xs text-amber-deep">
          Nobody is added yet — click a name in the list to add them.
        </p>
      ) : null}
    </div>
  );
}
