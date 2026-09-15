import type { AckState, TrackerStatus, TrackerTone } from "@/lib/services/wio-tracker-logic";

/**
 * The house colour rule, in one place.
 *
 *   green   On track, Released
 *   orange  At risk
 *   red     LATE HERE and OVERDUE — and nothing else
 *   neutral Not tracked
 *
 * Red is deliberately rare. The team rejected an earlier build of this tool
 * that turned most rows red: when everything is an emergency, the board stops
 * being read. Every status colour in the module resolves through here so that
 * property cannot quietly erode one component at a time.
 */
const TONE_CLASS: Record<TrackerTone, string> = {
  green: "border-forest/40 bg-forest/10 text-forest",
  orange: "border-warning/40 bg-warning/10 text-warning",
  red: "border-alert/50 bg-alert/10 text-alert",
  neutral: "border-line-strong bg-surface text-muted",
};

export function StatusPill({
  status,
  tone,
}: {
  status: TrackerStatus;
  tone: TrackerTone;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 font-body text-[11px] font-bold uppercase tracking-[0.08em] ${TONE_CLASS[tone]}`}
    >
      {status}
    </span>
  );
}

/**
 * The day countdown. Only ever red when the row is genuinely past its PIO
 * date — "D-2" is urgent but it is not late, and colouring it red would spend
 * the one signal the board has left.
 */
export function DayBadge({
  label,
  daysLeft,
  atRiskFrom,
}: {
  label: string;
  daysLeft: number | null;
  atRiskFrom: number;
}) {
  const tone: TrackerTone =
    daysLeft === null
      ? "neutral"
      : daysLeft < 0
        ? "red"
        : daysLeft <= atRiskFrom
          ? "orange"
          : "green";
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 font-body text-[11px] font-bold ${TONE_CLASS[tone]}`}
    >
      {label}
    </span>
  );
}

/**
 * The drawing team's 24-hour acknowledgement, under the status pill.
 *
 * Orange at most. A missed acknowledgement is a warning about WHY a row is
 * late, never a second red — red stays LATE HERE and OVERDUE only. Rows with
 * nothing to say (acknowledged on time, not applicable, or moved past the first
 * stage) render nothing, so the marker only appears where it asks for action.
 */
export function AckNote({
  state,
  due,
  onAck,
}: {
  state: AckState;
  due: string | null;
  /** Present only for someone who may edit the board. */
  onAck?: () => void;
}) {
  if (state !== "Awaiting" && state !== "Not acknowledged" && state !== "Acknowledged late") {
    return null;
  }
  const label =
    state === "Awaiting"
      ? `Acknowledge by ${due}`
      : state === "Not acknowledged"
        ? "Not acknowledged in 24h"
        : "Acknowledged late";
  return (
    <span
      className={`mt-1 flex flex-wrap items-center gap-1.5 whitespace-nowrap font-body text-[11px] ${
        state === "Awaiting" ? "font-light text-muted" : "font-bold text-warning"
      }`}
    >
      {label}
      {onAck && state !== "Acknowledged late" ? (
        <button
          type="button"
          onClick={onAck}
          className="rounded border border-line-strong bg-canvas px-1.5 py-0.5 font-bold text-secondary transition-colors hover:bg-hover"
        >
          Acknowledge
        </button>
      ) : null}
    </span>
  );
}
