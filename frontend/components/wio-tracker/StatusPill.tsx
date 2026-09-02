import type { TrackerStatus, TrackerTone } from "@/lib/services/wio-tracker-logic";

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
