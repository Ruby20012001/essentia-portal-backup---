"use client";

import { MetricCard } from "@/components/dashboard/MetricCard";
import { DayBadge, StatusPill } from "@/components/wio-tracker/StatusPill";
import type { TrackerBoard } from "@/lib/services/wio-tracker";

/**
 * Screen 1 — Today. Read-only by design: this is the screen the team stands
 * in front of, and the founders read on their own portal. Nothing here can be
 * changed by accident because nothing here can be changed at all.
 */
export function TodayView({ board }: { board: TrackerBoard }) {
  const { settings, stats, holding, wios } = board;
  const running = wios.filter((w) => !w.pioReleased);

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="WIOs issued today" value={String(stats.wiosIssuedToday)} />
        <MetricCard label="PIOs released today" value={String(stats.piosReleasedToday)} />
        <MetricCard
          label="Running"
          value={String(stats.running)}
          sub="not yet released"
        />
        <MetricCard label="Moved a stage today" value={String(stats.movedAStageToday)} />
        <MetricCard
          label="Stuck 5+ days"
          value={String(stats.stuckFivePlus)}
          sub="at the same stage"
        />
        <MetricCard label="Late here" value={String(stats.late)} />
        <MetricCard label="Overdue" value={String(stats.overdue)} />
        <MetricCard
          label="No WIO date"
          value={String(stats.noWioDate)}
          sub="clock never started"
        />
      </div>

      {/* The finding, said out loud rather than left to be inferred from a
          tile. A third of the board having no clock is the story of the day. */}
      {stats.noWioDate > 0 ? (
        <div className="mb-8 rounded-lg border-l-4 border-warning bg-warning/5 px-5 py-3">
          <p className="font-body text-sm font-light text-ink">
            <span className="font-bold text-warning">
              {stats.noWioDate} of {stats.running} running{" "}
              {stats.running === 1 ? "row has" : "rows have"} no WIO issue date.
            </span>{" "}
            Their 15-day clock has never started, so they cannot be late — they
            are simply untracked. Add the WIO date on the WIOs tab to put them
            on the clock.
          </p>
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Who is holding what</h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          One row per stage in the chain, in order. An empty stage is the part
          of the chain that is not the problem today.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-4 py-2.5 font-bold">Stage</th>
                <th className="px-4 py-2.5 font-bold">Waiting on</th>
                <th className="px-4 py-2.5 font-bold text-right">WIOs</th>
                <th className="px-4 py-2.5 font-bold text-right">Total days waiting</th>
                <th className="px-4 py-2.5 font-bold text-right">Longest</th>
                <th className="px-4 py-2.5 font-bold">Longest is</th>
              </tr>
            </thead>
            <tbody>
              {holding.map((h) => (
                <tr
                  key={h.stage}
                  className={`border-t border-line transition-colors hover:bg-hover ${
                    h.count === 0 ? "bg-canvas" : "bg-card"
                  }`}
                >
                  <td className="px-4 py-2.5 font-bold text-ink">
                    <span className="mr-2 text-muted">{h.position}</span>
                    {h.stage}
                  </td>
                  <td className="px-4 py-2.5 font-light text-secondary">{h.waitingOn}</td>
                  <td
                    className={`px-4 py-2.5 text-right ${
                      h.count === 0 ? "font-light text-muted" : "font-bold text-ink"
                    }`}
                  >
                    {h.count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-light text-secondary">
                    {h.count === 0 ? "—" : h.totalDaysWaiting}
                  </td>
                  <td className="px-4 py-2.5 text-right font-light text-secondary">
                    {h.count === 0 ? "—" : `${h.longest}d`}
                  </td>
                  <td className="px-4 py-2.5 font-light text-muted">
                    {h.longestWio ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">
          Every running WIO, worst first
        </h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          Sorted by urgency, not by number. The top of this list is the
          conversation to have first — read against {settings.today}.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2.5 font-bold">Raised by</th>
                <th className="px-3 py-2.5 font-bold">Project / scope</th>
                <th className="px-3 py-2.5 font-bold">WIO</th>
                <th className="px-3 py-2.5 font-bold">Day</th>
                <th className="px-3 py-2.5 font-bold">Stage</th>
                <th className="px-3 py-2.5 font-bold">Accountability</th>
                <th className="px-3 py-2.5 font-bold text-right">Days here</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Upcoming</th>
                <th className="px-3 py-2.5 font-bold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {running.map((w) => (
                <tr
                  key={w.id}
                  className="border-t border-line bg-card align-top transition-colors hover:bg-hover"
                >
                  <td className="px-3 py-2.5 font-light text-secondary">
                    {w.raisedBy ?? <span className="text-muted">not named</span>}
                  </td>
                  <td className="px-3 py-2.5 font-light text-ink">
                    {w.project ? (
                      <span className="block">{w.project}</span>
                    ) : (
                      <span className="block text-muted">No project named</span>
                    )}
                    <span className="block text-xs text-muted">{w.scope}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">
                    {w.wio}
                  </td>
                  <td className="px-3 py-2.5">
                    <DayBadge
                      label={w.dayLabel}
                      daysLeft={w.daysLeft}
                      atRiskFrom={settings.atRiskFrom}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-light text-ink">{w.stage}</td>
                  <td className="px-3 py-2.5 font-light text-secondary">
                    {w.accountability}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right ${
                      w.daysHere >= 5 ? "font-bold text-warning" : "font-light text-secondary"
                    }`}
                  >
                    {w.daysHere}d
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={w.status} tone={w.tone} />
                    {w.openDelays > 0 ? (
                      <span className="mt-1 block whitespace-nowrap font-body text-[11px] font-light text-muted">
                        {w.openDelays} open delay{w.openDelays === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 font-light text-muted">{w.upcomingStage}</td>
                  <td className="max-w-[22rem] px-3 py-2.5 font-light text-muted">
                    {w.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
