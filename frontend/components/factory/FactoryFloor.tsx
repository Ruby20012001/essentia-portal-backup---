import {
  assignmentState,
  daysLeft,
  type Assignment,
  type AssignmentState,
  type ForecastDay,
} from "@/lib/services/factory-floor-logic";

/**
 * S10 · NH8 production — the 14-day capacity chart and the PIO queue.
 * Read-only; styling only. Dark theme.
 */

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * One bar per day: PIOs arriving, with a tick at the manpower line. Bars are
 * drawn on one scale — the tallest of arrivals or capacity in the window.
 */
export function CapacityChart({ days }: { days: ForecastDay[] }) {
  const top = Math.max(1, ...days.map((d) => Math.max(d.arriving, d.capacity ?? 0)));
  return (
    <div className="rounded-lg border border-line bg-card px-5 pb-4 pt-5">
      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] items-end gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => (
            <div key={d.date} className="flex flex-col items-center gap-1">
              <span className={`font-body text-xs tabular-nums ${d.breach ? "font-bold text-error" : "text-white"}`}>
                {d.forecast ? d.arriving : "–"}
              </span>
              <div className="relative h-28 w-full rounded-sm bg-surface" aria-hidden="true">
                {d.forecast ? (
                  <div
                    className={`absolute inset-x-0 bottom-0 rounded-sm ${d.breach ? "bg-error/70" : "bg-success/50"}`}
                    style={{ height: `${(d.arriving / top) * 100}%` }}
                  />
                ) : null}
                {d.capacity !== null ? (
                  <div
                    className="absolute inset-x-[-2px] h-0.5 bg-white/70"
                    style={{ bottom: `calc(${(d.capacity / top) * 100}% - 1px)` }}
                    title={`Capacity ${d.capacity}`}
                  />
                ) : null}
              </div>
              <span className="font-body text-[10px] uppercase tracking-wide text-muted">D{d.n}</span>
              <span className="font-body text-[10px] text-muted">{dayLabel(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-body text-xs font-light text-muted">
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-success/50 align-middle" />PIOs arriving</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-white/70 align-middle" />Manpower capacity</span>
        <span><span className="mr-1 inline-block h-2 w-3 rounded-sm bg-error/70 align-middle" />More arriving than capacity</span>
        <span>– no forecast entered for that day</span>
      </p>
    </div>
  );
}

const STATE_TONE: Record<AssignmentState, string> = {
  Overdue: "bg-error/10 text-error",
  "In production": "bg-success/10 text-success",
  Queued: "bg-white/5 text-muted",
  Complete: "bg-white/5 text-muted",
};

export function PioQueue({ rows, today, showStation }: { rows: Assignment[]; today: string; showStation: boolean }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-10 text-center">
        <p className="font-heading text-2xl text-white">Queue is empty</p>
        <p className="mt-1 font-body text-sm font-light text-muted">No PIOs are assigned here right now.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left font-body text-[13.5px]">
        <thead>
          <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
            <th className="px-4 py-2.5 font-bold">PIO number</th>
            <th className="px-4 py-2.5 font-bold">Project</th>
            {showStation ? <th className="px-4 py-2.5 font-bold">Station</th> : null}
            <th className="px-4 py-2.5 font-bold">Scope</th>
            <th className="px-4 py-2.5 text-right font-bold">Days remaining</th>
            <th className="px-4 py-2.5 font-bold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const left = daysLeft(r.target, today);
            const state = assignmentState(r, today);
            return (
              <tr key={r.id} className="border-t border-line bg-card transition-colors hover:bg-hover">
                <td className="px-4 py-2.5 font-bold text-white">{r.pioNumber}</td>
                <td className="px-4 py-2.5 font-light text-white">{r.project ?? "—"}</td>
                {showStation ? <td className="px-4 py-2.5 font-light text-secondary">{r.station}</td> : null}
                <td className="px-4 py-2.5 font-light text-secondary">{r.scope ?? "—"}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${left < 0 ? "font-bold text-error" : "font-light text-white"}`}>
                  {left < 0 ? `${left} days` : left === 1 ? "1 day" : `${left} days`}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATE_TONE[state]}`}>
                    {state}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
