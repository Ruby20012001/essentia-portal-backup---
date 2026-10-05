/**
 * The five-minute pulse (S13, Blueprint §09) — the rules, with no network
 * and no database. A probe produces an outcome; this decides what it means
 * and how the failure streak moves.
 */

/** Slower than this and the integration works, but not well. */
export const SLOW_MS = 2_000;
/** This many failures in a row and the integration is degraded, and someone is told. */
export const DEGRADE_AFTER = 3;
/** Health logs are kept this long (db/001: "Retain 30 days"). */
export const RETAIN_DAYS = 30;

export type ProbeOutcome =
  | { kind: "ok"; ms: number }
  | { kind: "http"; ms: number; status: number; message: string }
  | { kind: "network"; ms: number | null; message: string };

export type PulseStatus = "healthy" | "degraded" | "down";

export function classify(o: ProbeOutcome): PulseStatus {
  if (o.kind === "ok") return o.ms > SLOW_MS ? "degraded" : "healthy";
  // Rate-limited or overloaded is answering, just not now.
  if (o.kind === "http" && (o.status === 429 || o.status === 529)) return "degraded";
  // Bad key, gone endpoint, server error, no answer at all: it does not work.
  return "down";
}

/** Error text to store: short, single line, never more than the provider said. */
export function errorText(o: ProbeOutcome): string | null {
  if (o.kind === "ok") return null;
  const head = o.kind === "http" ? `HTTP ${o.status}: ` : "";
  return (head + o.message).replace(/\s+/g, " ").trim().slice(0, 300);
}

export type StreakState = {
  consecutiveFailures: number;
  firstFailureAt: string | null;
  degraded: boolean;
};

export type StreakChange = StreakState & {
  /** This pulse ended a streak. */
  recovered: boolean;
  /** This pulse is the one that crossed DEGRADE_AFTER — alert exactly once. */
  justDegraded: boolean;
};

export function nextStreak(prev: StreakState | null, status: PulseStatus, nowIso: string): StreakChange {
  const before = prev ?? { consecutiveFailures: 0, firstFailureAt: null, degraded: false };
  if (status === "healthy") {
    return {
      consecutiveFailures: 0,
      firstFailureAt: null,
      degraded: false,
      recovered: before.consecutiveFailures > 0,
      justDegraded: false,
    };
  }
  const failures = before.consecutiveFailures + 1;
  return {
    consecutiveFailures: failures,
    firstFailureAt: before.firstFailureAt ?? nowIso,
    degraded: failures >= DEGRADE_AFTER,
    recovered: false,
    justDegraded: failures === DEGRADE_AFTER,
  };
}
