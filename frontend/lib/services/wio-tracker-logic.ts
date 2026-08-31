/**
 * WIO → PIO Tracker — the derivation layer (Brief §29-30).
 *
 * This module is PURE: no database, no clock, no environment. Everything the
 * board shows — days left, who is holding it, whether it is late, where it
 * goes next, how urgent it is — is computed here from four inputs the team
 * maintains by hand (`stage`, `since`, `wioIssued`, `pioReleased`) plus the
 * stage chain and the stamped date.
 *
 * Nothing derived is ever stored. A stored status is a status that goes stale
 * the moment nobody updates it, and a board that quietly lies about being on
 * time is worse than no board (ADR-HS-01, honest state). The original workbook
 * put it plainly: "A WIO sits at one stage at a time. Pick the stage. That is
 * the whole daily job."
 *
 * Purity is also why it is testable — see tests/unit/wio-tracker-logic.test.ts,
 * which pins every rule in this file against the spec.
 *
 * ALL DATE MATH IS IN WHOLE CALENDAR DAYS. Dates are handled as 'YYYY-MM-DD'
 * strings and diffed in UTC, never through the local timezone: a portal read
 * from Gurugram and one read from a CI runner in UTC must agree about whether
 * something is overdue.
 */

/** A stage in the chain. `position` carries the order; order is load-bearing. */
export type TrackerStage = {
  id: string;
  position: number;
  stage: string;
  waitingOn: string;
  /**
   * Days BEFORE the PIO-due date by which this stage must have cleared.
   * Counts DOWN the chain (14 → 0): a deadline offset, never a duration.
   */
  doneBy: number;
};

export type TrackerSettings = {
  teamName: string;
  windowDays: number;
  atRiskFrom: number;
  /** The stamped date the whole board is read against. Never the wall clock. */
  today: string;
  stampedBy: string | null;
  stampedAt: string | null;
};

/** The stored half of a row — exactly what a person edits. */
export type TrackerWioInput = {
  id: string;
  wio: string;
  project: string | null;
  scope: string | null;
  raisedBy: string | null;
  wioIssued: string | null;
  stageId: string;
  since: string | null;
  notes: string | null;
  pioReleased: string | null;
  pioNo: string | null;
};

export type TrackerStatus =
  | "Released"
  | "Not tracked"
  | "OVERDUE"
  | "LATE HERE"
  | "At risk"
  | "On track";

/**
 * House colour rule, carried over verbatim from the team's pushback on an
 * earlier build that turned most rows red:
 *   green   — On track, Released
 *   orange  — At risk, and anything merely "due"
 *   red     — LATE HERE and OVERDUE ONLY
 *   neutral — Not tracked
 * Red is rare on purpose. A board where everything is red says nothing.
 */
export type TrackerTone = "green" | "orange" | "red" | "neutral";

export type ComputedWio = TrackerWioInput & {
  stage: string;
  stagePosition: number;
  waitingOn: string;
  /** PIO-due date = wioIssued + windowDays. Null when the clock never started. */
  pioDue: string | null;
  /** Null once released, or when there is no WIO date — "n/a", not zero. */
  daysLeft: number | null;
  daysHere: number;
  stageDoneBy: number;
  /** The date THIS stage should have cleared by. */
  thisStageDue: string | null;
  dayLabel: string;
  accountability: string;
  upcomingStage: string;
  status: TrackerStatus;
  tone: TrackerTone;
  openDelays: number;
  priority: number;
};

// ---------------------------------------------------------------------
// Calendar-day arithmetic, timezone-free.
// ---------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' (or an ISO timestamp) → UTC midnight ms. */
function toUtcDay(date: string): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  );
}

/** Whole calendar days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / MS_PER_DAY);
}

/** `date` shifted by `days`, back as 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  return new Date(toUtcDay(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Normalises anything date-ish (ISO timestamp, Date, 'YYYY-MM-DD') to a day. */
export function toDayString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

/** Today, for use as a DEFAULT when the board has never been stamped. */
export function currentDay(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// The chain.
// ---------------------------------------------------------------------

/**
 * The final stage holds a placeholder in `waiting_on` — it is not a team, it
 * means "whoever raised this WIO". Recognising it by the sentinel rather than
 * only by the literal name keeps the rule config-driven, which is the whole
 * reason the chain lives in rows: the team edits it, and a renamed stage must
 * not silently strip a row of its owner. The literal 'PIO' is kept alongside
 * so behaviour matches the spec exactly on the chain as seeded.
 */
const RAISER_SENTINEL = "WIO raised by";

function heldByRaiser(stage: TrackerStage): boolean {
  return stage.stage === "PIO" || stage.waitingOn === RAISER_SENTINEL;
}

/** Who a stage goes to, resolving the raised-by placeholder. */
function holderOf(stage: TrackerStage, raisedBy: string | null): string {
  if (heldByRaiser(stage)) return raisedBy?.trim() || "not named";
  return stage.waitingOn;
}

export function sortStages(stages: TrackerStage[]): TrackerStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

// ---------------------------------------------------------------------
// The derivation.
// ---------------------------------------------------------------------

/**
 * Computes one row. `openDelays` is passed in rather than looked up so this
 * stays pure — the caller counts them once for the whole board.
 */
export function computeWio(
  wio: TrackerWioInput,
  stages: TrackerStage[],
  settings: TrackerSettings,
  openDelays: number,
): ComputedWio {
  const ordered = sortStages(stages);
  const index = ordered.findIndex((s) => s.id === wio.stageId);
  const stage = ordered[index];
  if (!stage) {
    // The FK makes this unreachable in practice. If it ever happens, say so
    // rather than defaulting to a stage and reporting a confident wrong answer.
    throw new Error(
      `WIO ${wio.wio} points at stage ${wio.stageId}, which is not in the chain.`,
    );
  }

  const today = settings.today;
  const released = wio.pioReleased !== null;

  const pioDue = wio.wioIssued ? addDays(wio.wioIssued, settings.windowDays) : null;

  // daysLeft is meaningless once released — null reads as "n/a" downstream and
  // cannot be mistaken for "0 days left".
  const daysLeft = pioDue && !released ? daysBetween(today, pioDue) : null;

  // Clamped at 0: a `since` stamped in the future is a typo, not -3 days here.
  const daysHere = wio.since ? Math.max(0, daysBetween(wio.since, today)) : 0;

  const stageDoneBy = stage.doneBy;
  const thisStageDue = pioDue ? addDays(pioDue, -stageDoneBy) : null;

  const dayLabel = released
    ? "PIO released"
    : !wio.wioIssued
      ? "Add the WIO date"
      : daysLeft! >= 0
        ? `D-${daysLeft}`
        : `OVERDUE +${-daysLeft!}`;

  const accountability = holderOf(stage, wio.raisedBy);

  const next = ordered[index + 1];
  const upcomingStage = released
    ? "—"
    : !next
      ? "— last stage"
      : `${next.stage}  ·  ${holderOf(next, wio.raisedBy)}`;

  // Priority order, first match wins. "LATE HERE" means the row is still
  // inside the overall window but has already blown THIS stage's deadline —
  // the early warning that stops an overdue happening at all.
  const status: TrackerStatus = released
    ? "Released"
    : !wio.wioIssued
      ? "Not tracked"
      : daysLeft! < 0
        ? "OVERDUE"
        : daysLeft! < stageDoneBy
          ? "LATE HERE"
          : daysLeft! <= settings.atRiskFrom
            ? "At risk"
            : "On track";

  // Higher = more urgent. Lateness dominates; time parked at one stage breaks
  // ties (capped at 20 so one ancient row cannot outrank every real fire);
  // each open delay adds a little, because a row someone has already flagged
  // is a row that is not moving on its own.
  const lateness =
    released || daysLeft === null
      ? 0
      : daysLeft < 0
        ? 60
        : daysLeft < stageDoneBy
          ? 40
          : daysLeft <= settings.atRiskFrom
            ? 20
            : 0;
  const priority = lateness + Math.min(daysHere, 20) + openDelays * 5;

  return {
    ...wio,
    stage: stage.stage,
    stagePosition: stage.position,
    waitingOn: stage.waitingOn,
    pioDue,
    daysLeft,
    daysHere,
    stageDoneBy,
    thisStageDue,
    dayLabel,
    accountability,
    upcomingStage,
    status,
    tone: toneFor(status),
    openDelays,
    priority,
  };
}

export function toneFor(status: TrackerStatus): TrackerTone {
  switch (status) {
    case "OVERDUE":
    case "LATE HERE":
      return "red";
    case "At risk":
      return "orange";
    case "On track":
    case "Released":
      return "green";
    case "Not tracked":
      return "neutral";
  }
}

/** The whole board, worst first. */
export function computeBoard(
  wios: TrackerWioInput[],
  stages: TrackerStage[],
  settings: TrackerSettings,
  openDelaysByWio: Map<string, number>,
): ComputedWio[] {
  return wios
    .map((w) => computeWio(w, stages, settings, openDelaysByWio.get(w.id) ?? 0))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        // Stable, meaningful tiebreak: fewest days left, then WIO number, so
        // the order never shuffles between two reads of unchanged data.
        (a.daysLeft ?? Number.POSITIVE_INFINITY) -
          (b.daysLeft ?? Number.POSITIVE_INFINITY) ||
        a.wio.localeCompare(b.wio),
    );
}

// ---------------------------------------------------------------------
// The Today dashboard roll-ups.
// ---------------------------------------------------------------------

export type TodayStats = {
  wiosIssuedToday: number;
  piosReleasedToday: number;
  running: number;
  movedAStageToday: number;
  stuckFivePlus: number;
  late: number;
  overdue: number;
  noWioDate: number;
};

export function todayStats(board: ComputedWio[], settings: TrackerSettings): TodayStats {
  const today = settings.today;
  const running = board.filter((w) => !w.pioReleased);
  return {
    wiosIssuedToday: board.filter((w) => w.wioIssued === today).length,
    piosReleasedToday: board.filter((w) => w.pioReleased === today).length,
    running: running.length,
    movedAStageToday: running.filter((w) => w.since === today).length,
    stuckFivePlus: running.filter((w) => w.daysHere >= 5).length,
    late: running.filter((w) => w.status === "LATE HERE").length,
    overdue: running.filter((w) => w.status === "OVERDUE").length,
    noWioDate: running.filter((w) => !w.wioIssued).length,
  };
}

export type HoldingRow = {
  stage: string;
  position: number;
  waitingOn: string;
  count: number;
  totalDaysWaiting: number;
  longest: number;
  /** The row that has sat here longest — the one to ask about by name. */
  longestWio: string | null;
};

/**
 * "Who is holding what" — one row per stage, in chain order, including the
 * stages holding nothing. An empty stage is information: it is the part of
 * the chain that is not the problem today.
 */
export function holdingByStage(
  board: ComputedWio[],
  stages: TrackerStage[],
): HoldingRow[] {
  const running = board.filter((w) => !w.pioReleased);
  return sortStages(stages).map((s) => {
    const here = running.filter((w) => w.stageId === s.id);
    const longestRow = here.reduce<ComputedWio | null>(
      (best, w) => (best === null || w.daysHere > best.daysHere ? w : best),
      null,
    );
    return {
      stage: s.stage,
      position: s.position,
      waitingOn: s.waitingOn,
      count: here.length,
      totalDaysWaiting: here.reduce((n, w) => n + w.daysHere, 0),
      longest: longestRow?.daysHere ?? 0,
      longestWio: longestRow?.wio ?? null,
    };
  });
}
