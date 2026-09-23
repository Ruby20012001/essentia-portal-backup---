"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * The top of the hiring board: what is open, who is moving, what is in the
 * diary this week, and — the one that stops work — what has been sat in and
 * never written up.
 *
 * TWO JOBS FOR COLOUR, KEPT APART. Stages are an order, not a set of
 * categories: screening is not a different kind of thing from the offer, it is
 * an earlier step on the same walk. Six hues would say "six unrelated things",
 * so the funnel is one colour getting stronger — white at rising opacity — and
 * position alone carries the meaning. That leaves warning and error to mean
 * exactly one thing anywhere on this screen: somebody has to do something.
 *
 * EMPTY IS THE NORMAL STATE TODAY. The board has no seats and no candidates,
 * and four large zeroes counting up to nothing reads as broken rather than
 * new. With nothing on it this renders one quiet line and stops.
 */

export type PulseStage = { code: string; label: string; count: number };
export type PulseOwed = {
  interviewId: string;
  candidateId: string;
  candidateName: string;
  stageLabel: string;
  written: number;
  panelSize: number;
  daysWaiting: number;
};

export function BoardPulse({
  seatsOpen,
  headcount,
  peopleMoving,
  roundsThisWeek,
  roundsAhead,
  feedbackOwed,
  stages,
  owed,
  canOpenSeat,
}: {
  seatsOpen: number;
  headcount: number;
  peopleMoving: number;
  roundsThisWeek: number;
  roundsAhead: number;
  feedbackOwed: number;
  stages: PulseStage[];
  owed: PulseOwed[];
  canOpenSeat: boolean;
}) {
  const nothingYet =
    seatsOpen === 0 && peopleMoving === 0 && roundsAhead === 0 && feedbackOwed === 0;

  if (nothingYet) {
    return (
      <div className="mb-8 rounded-lg border border-line bg-card px-6 py-12 text-center">
        <p className="font-heading text-2xl text-white">Nothing open yet</p>
        <p className="mx-auto mt-2 max-w-md font-body text-sm font-light text-muted">
          {canOpenSeat
            ? "Open a seat and the people against it, the rounds in the diary and the write-ups still owed all appear here."
            : "When HR opens a seat, what is happening against it appears here."}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Seats open" value={seatsOpen} sub={`${headcount} to fill`} />
        <Tile label="People moving" value={peopleMoving} sub="in the pipeline" />
        <Tile
          label="Rounds this week"
          value={roundsThisWeek}
          sub={roundsAhead > roundsThisWeek ? `${roundsAhead} ahead in all` : "scheduled"}
        />
        <Tile
          label="Write-ups owed"
          value={feedbackOwed}
          sub={feedbackOwed === 0 ? "all caught up" : "rounds held, nothing written"}
          attention={feedbackOwed > 0}
        />
      </div>

      {stages.some((s) => s.count > 0) ? (
        <Funnel stages={stages} />
      ) : null}

      {owed.length > 0 ? <Owed rows={owed} /> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- tiles -- */

function Tile({
  label,
  value,
  sub,
  attention = false,
}: {
  label: string;
  value: number;
  sub?: string;
  attention?: boolean;
}) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4 transition-colors duration-300 hover:border-line-strong">
      <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p
        className={`mt-2 font-body text-3xl font-light leading-tight tabular-nums ${
          attention ? "text-warning" : "text-white"
        }`}
      >
        {shown}
      </p>
      {sub ? (
        <p className="mt-0.5 font-body text-xs font-light text-muted">{sub}</p>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- funnel -- */

function Funnel({ stages }: { stages: PulseStage[] }) {
  const grown = useGrow();
  const most = Math.max(...stages.map((s) => s.count), 1);

  return (
    <section className="mt-6 rounded-lg border border-line bg-card px-5 py-5">
      <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
        Where people are
      </p>
      <ul className="mt-4 space-y-3">
        {stages.map((s, i) => {
          /* One colour, getting stronger with the walk — the order is the
             message, so it is carried by depth rather than by hue. */
          const strength = 18 + Math.round((i / Math.max(stages.length - 1, 1)) * 62);
          return (
            <li key={s.code} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate font-body text-xs font-light text-secondary sm:w-40">
                {s.label}
              </span>
              <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface">
                <span
                  className="block h-full rounded-full bg-white transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{
                    width: grown ? `${Math.max((s.count / most) * 100, s.count ? 6 : 0)}%` : "0%",
                    opacity: strength / 100,
                  }}
                />
              </span>
              <span className="w-6 shrink-0 text-right font-body text-xs font-light tabular-nums text-muted">
                {s.count}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------- owed -- */

function Owed({ rows }: { rows: PulseOwed[] }) {
  return (
    <section className="mt-6 rounded-lg border border-line bg-card px-5 py-5">
      <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
        Waiting on a write-up
      </p>
      <p className="mt-1 font-body text-xs font-light text-muted">
        Oldest first. Nobody moves on until these are in.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.interviewId} className="py-2.5">
            <Link
              href={`/hr/candidates/${r.candidateId}`}
              className="-mx-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded px-2 py-1 transition-colors hover:bg-hover"
            >
              <span className="min-w-0">
                <span className="font-body text-sm text-white">{r.candidateName}</span>
                <span className="ml-2 font-body text-xs font-light text-muted">
                  {r.stageLabel}
                </span>
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="font-body text-xs font-light text-secondary tabular-nums">
                  {r.written} of {r.panelSize} written
                </span>
                <span
                  className={`font-body text-xs tabular-nums ${
                    r.daysWaiting >= 7 ? "text-error" : "text-warning"
                  }`}
                >
                  {r.daysWaiting === 0
                    ? "today"
                    : `${r.daysWaiting} day${r.daysWaiting === 1 ? "" : "s"}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- movement -- */

function prefersStill() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Counts up to the real figure. The figure is the point and the count is not,
 * so it lands on `target` whatever happens to the frames — a number that stops
 * short is worse than one that never moved.
 */
function useCountUp(target: number) {
  const [shown, setShown] = useState(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (prefersStill() || target === 0) {
      setShown(target);
      return;
    }
    const started = performance.now();
    const ms = 520;
    setShown(0);
    const step = (now: number) => {
      const t = Math.min((now - started) / ms, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    const settle = window.setTimeout(() => setShown(target), ms + 220);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      window.clearTimeout(settle);
    };
  }, [target]);

  return shown;
}

/** Bars start at nothing and are given their width once, after mount. */
function useGrow() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (prefersStill()) {
      setGrown(true);
      return;
    }
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return grown;
}
