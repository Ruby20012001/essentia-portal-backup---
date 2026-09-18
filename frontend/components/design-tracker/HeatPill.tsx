"use client";

import { useEffect, useState } from "react";
import {
  activitiesSkippedByType,
  type ActivityState,
  type ComputedActivity,
  type ComputedProject,
  type DesignActivity,
  type DesignProjectType,
  type Heat,
} from "@/lib/services/design-tracker-logic";

/**
 * The three heats, in one place — the WIO board's colour rule carried over.
 *
 *   HOT   red     an activity is past its due date — and nothing else is red
 *   WARM  orange  something is due within the warm window
 *   COLD  blue    on time, nothing close
 *   DONE  green   · NOT TRACKED neutral (no start date)
 */
export const HEAT_CLASS: Record<Heat, string> = {
  HOT: "border-alert/50 bg-alert/10 text-alert",
  WARM: "border-warning/40 bg-warning/10 text-warning",
  COLD: "border-navy/40 bg-navy/10 text-navy",
  DONE: "border-forest/40 bg-forest/10 text-forest",
  "NOT TRACKED": "border-line-strong bg-surface text-muted",
};

export const HEAT_DOT: Record<Heat, string> = {
  HOT: "bg-alert",
  WARM: "bg-warning",
  COLD: "bg-navy",
  DONE: "bg-forest",
  "NOT TRACKED": "bg-line-strong",
};

const STATE_HEAT: Record<ActivityState, Heat> = {
  HOT: "HOT",
  WARM: "WARM",
  COLD: "COLD",
  Done: "DONE",
  "Done late": "WARM",
  "N/A": "NOT TRACKED",
  "No due day": "NOT TRACKED",
  "Not started": "NOT TRACKED",
};

/**
 * The project's kind, so it is seen and not only stored: a house for
 * residential, a building for commercial, then the type itself.
 */
export function TypeBadge({ type }: { type: DesignProjectType | null }) {
  if (!type) return null;
  const residential = type.segment === "residential";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-body text-[11px] font-bold ${
        residential ? "border-forest/40 bg-forest/10 text-forest" : "border-amber-deep/50 bg-amber-deep/10 text-amber-deep"
      }`}
    >
      <span aria-hidden>{residential ? "🏠" : "🏢"}</span>
      {residential ? "Residential" : "Commercial"}
      <span className="font-light opacity-80">· {type.label}</span>
    </span>
  );
}

/** Said the moment a type is chosen, so the change to the chart is not silent. */
export function typeChangeMessage(
  projectName: string,
  type: DesignProjectType | null,
  activities: DesignActivity[],
): string {
  if (!type) return `${projectName}: type cleared — every activity is back on its chart.`;
  const segment = type.segment === "residential" ? "Residential" : "Commercial";
  const skipped = activitiesSkippedByType(type, activities);
  if (skipped.length === 0) {
    return `${projectName} is now ${segment} · ${type.label}. It stands on its own plot, so ${activities
      .filter((a) => a.needsOwnPlot)
      .map((a) => a.task)
      .join(" and ")} stay on its chart — all ${activities.length} activities.`;
  }
  return `${projectName} is now ${segment} · ${type.label}. No plot of its own, so ${skipped
    .map((a) => a.task)
    .join(" and ")} ${skipped.length === 1 ? "is" : "are"} taken off its chart — ${
    activities.length - skipped.length
  } activities instead of ${activities.length}.`;
}

/**
 * A button that asks before it acts — in the page, not in a browser dialog.
 *
 * `window.confirm` is SUPPRESSED inside the desktop app's window: it returns
 * false in a millisecond without ever showing anything, so every button behind
 * one silently did nothing (Monica, 18 Sep: "ye cross work ni krre"). Nothing
 * here may depend on confirm(), alert() or prompt() again.
 *
 * First press turns the button into "<question> Yes / No". Anywhere else, or
 * No, puts it back.
 */
export function ConfirmButton({
  label,
  question,
  className,
  disabled,
  title,
  onConfirm,
}: {
  label: string;
  question: string;
  className: string;
  disabled?: boolean;
  title?: string;
  onConfirm: () => void;
}) {
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const away = () => setAsking(false);
    // A click anywhere else, or Escape, means "no".
    const key = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    document.addEventListener("click", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", key);
    };
  }, [asking]);

  if (!asking) {
    return (
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={(e) => {
          e.stopPropagation();
          setAsking(true);
        }}
        className={className}
      >
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-amber-deep/60 bg-amber-deep/10 px-2 py-1 font-body text-xs"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="font-light text-secondary">{question}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="rounded bg-forest px-2 py-0.5 font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="rounded border border-line-strong bg-canvas px-2 py-0.5 font-bold text-secondary transition-colors hover:bg-hover"
      >
        No
      </button>
    </span>
  );
}

export const inputClass =
  "w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none disabled:opacity-50";

export const labelClass =
  "mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted";

/** What each colour means, for a tooltip and a screen reader — never printed as a label. */
export const HEAT_MEANING: Record<Heat, string> = {
  HOT: "Late",
  WARM: "Due soon",
  COLD: "On time",
  DONE: "Done",
  "NOT TRACKED": "No start date",
};

/**
 * The heat as colour alone (Monica, 16 Sep 2026: "bs color rhne do, inke naam
 * hta do"). Red, orange and blue are a dot; Done and No start date are not
 * heats, so they keep a word.
 */
export function HeatPill({ heat }: { heat: Heat }) {
  if (heat === "DONE" || heat === "NOT TRACKED") {
    return (
      <span
        className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 font-body text-[11px] font-bold ${HEAT_CLASS[heat]}`}
      >
        {HEAT_MEANING[heat]}
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={HEAT_MEANING[heat]}
      title={HEAT_MEANING[heat]}
      className={`inline-block h-3.5 w-3.5 rounded-full align-middle ${HEAT_DOT[heat]}`}
    />
  );
}

export function ActivityBadge({ activity }: { activity: ComputedActivity }) {
  const a = activity;
  const label =
    a.state === "HOT"
      ? `${a.daysLate}d late`
      : a.state === "WARM"
        ? a.daysToDue === 0
          ? "due today"
          : `due in ${a.daysToDue}d`
        : a.state === "COLD"
          ? `${a.daysToDue}d to go`
          : a.state === "Done late"
            ? `Done ${a.daysLate}d late`
            : a.state;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 font-body text-[11px] font-bold ${HEAT_CLASS[STATE_HEAT[a.state]]}`}
    >
      {label}
    </span>
  );
}

/** "Day 57 / 238" — where the project stands on the chart. */
export function DayBadge({ project }: { project: ComputedProject }) {
  if (project.heat === "DONE") {
    return <span className="font-body text-xs font-light text-muted">done{project.completedOn ? ` ${project.completedOn}` : ""}</span>;
  }
  if (project.day === null) {
    return <span className="font-body text-xs font-light text-muted">Add the start date</span>;
  }
  return (
    <span className="whitespace-nowrap font-body text-xs text-secondary">
      <span className="font-bold text-ink">Day {project.day}</span>
      <span className="font-light text-muted"> / {project.lastDay}</span>
    </span>
  );
}

/** The legend, said once per screen so nobody has to guess what blue means. */
export function HeatLegend({ warmWithin }: { warmWithin: number }) {
  const items: { heat: Heat; say: string }[] = [
    { heat: "HOT", say: "late — an activity is past its due day" },
    { heat: "WARM", say: `due within ${warmWithin} day${warmWithin === 1 ? "" : "s"}` },
    { heat: "COLD", say: "on time" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-body text-xs font-light text-muted">
      {items.map((i) => (
        <span key={i.heat} className="flex items-center gap-1.5">
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${HEAT_DOT[i.heat]}`} />
          {i.say}
        </span>
      ))}
    </div>
  );
}

/**
 * The drop-down under a project: why it is the colour it is. Every late
 * activity by name, how late, and whom it depends on; then what is due soon.
 */
export function ProjectBreakdown({ project }: { project: ComputedProject }) {
  const p = project;
  return (
    <div className="font-body text-[13px]">
      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 font-light text-muted">
        <span>
          Type <span className="text-secondary">{p.type?.label ?? "not said"}</span>
        </span>
        <span>
          Client <span className="text-secondary">{p.client ?? "—"}</span>
        </span>
        {p.location ? (
          <span>
            Location <span className="text-secondary">{p.location}</span>
          </span>
        ) : null}
        <span>
          Started <span className="text-secondary">{p.startDate ?? "not set"}</span>
        </span>
        <span>
          Activities done{" "}
          <span className="text-secondary">
            {p.doneCount} of {p.applicableCount}
          </span>
        </span>
        {p.current ? (
          <span>
            Now at <span className="text-secondary">{p.current.code} · {p.current.task}</span>
          </span>
        ) : null}
      </div>

      {p.late.length === 0 && p.dueSoon.length === 0 ? (
        <p className="font-light text-muted">
          {p.heat === "NOT TRACKED"
            ? "No start date — the chart cannot say what is due until the project has a day 0."
            : p.heat === "DONE"
              ? "Every activity is done."
              : "Nothing late and nothing due soon."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface text-[10.5px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2 font-bold">Activity</th>
                <th className="px-3 py-2 font-bold">Due</th>
                <th className="px-3 py-2 font-bold">Status</th>
                <th className="px-3 py-2 font-bold">Depends on</th>
                <th className="px-3 py-2 font-bold">Remark</th>
              </tr>
            </thead>
            <tbody>
              {[...p.late, ...p.dueSoon].map((a) => (
                <tr key={a.id} className="border-t border-line bg-card align-top">
                  <td className="px-3 py-2 text-ink">
                    <span className="mr-2 text-muted">{a.code}</span>
                    {a.task}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-light text-secondary">
                    {a.dueDate}
                    <span className="block text-[11px] text-muted">day {a.dueDay}</span>
                  </td>
                  <td className="px-3 py-2">
                    <ActivityBadge activity={a} />
                  </td>
                  <td className="px-3 py-2 font-light text-secondary">
                    {a.dependsOn}
                    {a.dependsOnClient ? (
                      <span className="mt-0.5 block text-[11px] font-bold text-warning">
                        depends on the client
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[18rem] px-3 py-2 font-light text-muted">{a.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.notes ? <p className="mt-3 font-light text-muted">Notes: {p.notes}</p> : null}
    </div>
  );
}
