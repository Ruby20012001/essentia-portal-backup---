"use client";

import { Fragment, useState } from "react";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { BigNumber, Columns, Gauge, Treemap } from "@/components/design-tracker/DesignCharts";
import { Donut } from "@/components/design-tracker/DesignDonut";
import {
  DayBadge,
  HEAT_DOT,
  HEAT_MEANING,
  HeatLegend,
  HeatPill,
  ProjectBreakdown,
} from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import {
  forPerson,
  forSegment,
  type ComputedProject,
  type Heat,
  heatCounts,
  holdingByDependency,
  personRows,
} from "@/lib/services/design-tracker-logic";

/**
 * Screen 1 — Today. Read-only, like the WIO board's.
 *
 * With nobody picked it is Vishakha's page: her name at the top, her designers
 * under it, each with their red / orange / blue and the one project holding them
 * up — named, with the activity and whom it depends on. Picking a name narrows
 * every figure on the screen to that designer; the numbers are the same pure
 * functions over fewer projects, so the two can never disagree.
 */
export function DesignTodayView({
  board,
  person,
  onPerson,
}: {
  board: DesignBoard;
  person: string | null;
  onPerson: (id: string | null) => void;
}) {
  const { settings } = board;
  const projects = forPerson(board.projects, person);
  const counts = heatCounts(projects);
  const holding = holdingByDependency(projects);
  const running = projects.filter((p) => p.heat !== "DONE");
  const hot = running.filter((p) => p.heat === "HOT");
  const selected = board.people.find((p) => p.id === person) ?? null;
  const head = board.people.find((p) => p.role === "head") ?? null;
  const team = personRows(board.projects, board.people).filter(
    (row) => row.role === "designer" || row.counts.running + row.counts.done > 0,
  );
  const [open, setOpen] = useState<string | null>(null);

  // ── what the visuals above the tables are made of ──────────────────

  /** Activities recorded done in each of the last six months. */
  const byMonth = (() => {
    const out: { key: string; label: string; count: number }[] = [];
    const [y, m] = [Number(settings.today.slice(0, 4)), Number(settings.today.slice(5, 7))];
    for (let back = 5; back >= 0; back--) {
      const d = new Date(Date.UTC(y, m - 1 - back, 1));
      const key = d.toISOString().slice(0, 7);
      out.push({
        key,
        label: d.toLocaleString("en", { month: "short", timeZone: "UTC" }),
        count: projects.reduce(
          (n, p) => n + p.activities.filter((a) => a.doneOn?.startsWith(key)).length,
          0,
        ),
      });
    }
    return out;
  })();

  /** The treemap: a column per designer, a box per project, sized by days late. */
  const treemap = board.people
    .map((d) => {
      const items = running
        .filter((p) => p.designerId === d.id)
        // A project that is not late still has to be visible, so it counts 1.
        .map((p) => ({
          key: p.id,
          label: p.name,
          value: Math.max(1, p.delayDays),
          tone: HEAT_BG[p.heat],
          title: `${p.name} — ${p.delayDays > 0 ? `${p.delayDays} days late at ${p.causedBy?.task}` : HEAT_MEANING[p.heat].toLowerCase()}`,
          onClick: () => onPerson(d.id),
        }))
        .sort((a, b) => b.value - a.value);
      return {
        key: d.id,
        label: d.name,
        value: items.reduce((n, i) => n + i.value, 0),
        items,
        onClick: () => onPerson(d.id),
      };
    })
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.value - a.value);

  /** Days late by dependency: the top five, the rest folded into "other". */
  const dependencySlices = (() => {
    const map = new Map<string, number>();
    for (const p of running) {
      for (const a of p.late) map.set(a.dependsOn, (map.get(a.dependsOn) ?? 0) + (a.daysLate ?? 0));
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((n, [, v]) => n + v, 0);
    // One hue, stepped — this is magnitude, not identity, so no new colours.
    const steps = ["text-alert", "text-alert/80", "text-alert/60", "text-alert/45", "text-alert/30"];
    const dots = ["bg-alert", "bg-alert/80", "bg-alert/60", "bg-alert/45", "bg-alert/30"];
    const slices = top.map(([name, days], i) => ({
      key: name,
      label: name,
      value: days,
      tone: steps[i]!,
      dot: dots[i]!,
    }));
    if (rest > 0) {
      slices.push({ key: "other", label: "everybody else", value: rest, tone: "text-line-strong", dot: "bg-line-strong" });
    }
    return slices;
  })();
  const dependencyTotal = dependencySlices.reduce((n, s) => n + s.value, 0);

  const doneActivities = running.reduce((n, p) => n + p.doneCount, 0);
  const applicableActivities = running.reduce((n, p) => n + p.applicableCount, 0);

  return (
    <div>
      {/* Whose page this is. */}
      <section className="mb-8 rounded-lg border border-line bg-card px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
              {selected ? (selected.role === "head" ? "Head of the team" : "Designer") : head?.title ?? "Head of Interior Design"}
            </p>
            <h2 className="font-heading text-3xl text-white">
              {selected ? selected.name : (head?.name ?? settings.teamName)}
            </h2>
            <p className="font-body text-sm font-light text-muted">
              {selected
                ? `${counts.running} running ${counts.running === 1 ? "project" : "projects"} · ${counts.done} done`
                : `${settings.teamName} · ${team.length} ${team.length === 1 ? "person" : "people"} · ${counts.running} running projects`}
            </p>
          </div>
          {selected && board.viewer.scope === "all" ? (
            <button
              type="button"
              onClick={() => onPerson(null)}
              data-print="hide"
              className="ml-auto rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
            >
              ← Back to {head?.name ?? "the"}&rsquo;s team
            </button>
          ) : null}
        </div>
        <div className="mt-3 border-t border-line pt-3">
          <HeatLegend warmWithin={settings.warmWithin} />
        </div>
      </section>

      {/* The page as a board of visuals (Monica, 18 Sep, with a Power BI page
          for reference): work done month by month, the projects as a treemap,
          then who the delay waits on, how far the team has got, and the two
          numbers that lead. Every mark says its own value. */}
      <div className="mb-8 grid gap-4 lg:grid-cols-12">
        <Panel className="lg:col-span-6" title="Activities completed, month by month">
          <Columns
            columns={byMonth.map((m) => ({
              key: m.key,
              label: m.label,
              value: m.count,
              tone: "bg-forest",
              title: `${m.count} activities recorded done in ${m.label}`,
            }))}
          />
        </Panel>

        <Panel
          className="lg:col-span-6"
          title="Every project, by how far behind it is"
          note="Bigger means later. Colour is its status — click one for that designer."
        >
          {treemap.length === 0 ? (
            <Empty>No running projects.</Empty>
          ) : (
            <Treemap groups={treemap} />
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="Who the delay is waiting on" note="Share of all the days late.">
          {dependencySlices.length === 0 ? (
            <Empty>Nothing is late.</Empty>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <Donut
                slices={dependencySlices}
                total={dependencyTotal}
                centreValue={dependencyTotal}
                centreLabel="days late"
              />
              <ul className="min-w-[8rem] flex-1 space-y-1">
                {dependencySlices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 font-body text-[12px]">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${s.dot}`} />
                    <span className="truncate text-secondary">{s.label}</span>
                    <span className="ml-auto font-bold text-ink">{s.value}d</span>
                    <span className="w-9 text-right font-light text-muted">
                      {Math.round((s.value / dependencyTotal) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="lg:col-span-4" title="How much of the work is done" note="Activities done, across every running project.">
          <Gauge
            value={doneActivities}
            max={Math.max(1, applicableActivities)}
            tone={counts.hot > 0 ? "text-alert" : "text-forest"}
            centre={`${Math.round((doneActivities / Math.max(1, applicableActivities)) * 100)}%`}
            centreSub="done"
            minLabel="0"
            maxLabel={String(applicableActivities)}
            title={`${doneActivities} of ${applicableActivities} activities done`}
          />
        </Panel>

        <div className="grid gap-4 lg:col-span-4">
          <BigNumber
            value={counts.lateActivities}
            label="Late activities"
            tone={counts.lateActivities > 0 ? "text-alert" : "text-white"}
            sub={`${counts.clientLate} waiting on the client`}
          />
          <BigNumber
            value={counts.running}
            label="Running projects"
            sub={`${counts.hot} late · ${counts.warm} due soon · ${counts.cold} on time${
              counts.notTracked > 0 ? ` · ${counts.notTracked} no start date` : ""
            }`}
          />
        </div>
      </div>

      {/* The finding, said out loud — which projects, whose, and why. */}
      {hot.length > 0 ? (
        <div className="mb-8 rounded-lg border-l-4 border-alert bg-alert/5 px-5 py-3">
          <p className="font-body text-sm font-light text-ink">
            <span className="font-bold text-alert">
              {hot.length} {hot.length === 1 ? "project is" : "projects are"} late.
            </span>{" "}
            {hot.slice(0, 4).map((p, i) => (
              <Fragment key={p.id}>
                {i > 0 ? " · " : ""}
                <span className="font-bold">{p.name}</span>
                {person === null ? ` (${p.designer})` : ""} — {p.delayDays}d late at{" "}
                {p.causedBy?.task}, depends on {p.causedBy?.dependsOn}
              </Fragment>
            ))}
            {hot.length > 4 ? ` · and ${hot.length - 4} more on the Delays tab` : ""}.
          </p>
        </div>
      ) : null}

      {counts.notTracked > 0 ? (
        <div className="mb-8 rounded-lg border-l-4 border-warning bg-warning/5 px-5 py-3">
          <p className="font-body text-sm font-light text-ink">
            <span className="font-bold text-warning">
              {counts.notTracked} {counts.notTracked === 1 ? "project has" : "projects have"} no start date.
            </span>{" "}
            The chart counts from day 0, so they cannot be late — they are simply untracked. Add the start date
            on the Projects tab.
          </p>
        </div>
      ) : null}

      {/* Vishakha's list — only on the whole-team page. */}
      {person === null && board.viewer.scope === "all" ? (
        <section className="mb-10">
          <h2 className="mb-1 font-heading text-2xl text-white">
            {head ? `${head.name}'s team` : "The team"}
          </h2>
          <p className="mb-3 font-body text-sm font-light text-muted">
            Pick a name to see their projects. &ldquo;Holding them up&rdquo; is their hottest project, the activity
            that is late on it, and whom that activity depends on.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left font-body text-[13.5px]">
              <thead>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                  <th className="px-4 py-2.5 font-bold">Designer</th>
                  <th className="px-4 py-2.5 text-right font-bold">Running</th>
                  <HeatTh heat="HOT" />
                  <HeatTh heat="WARM" />
                  <HeatTh heat="COLD" />
                  <th className="px-4 py-2.5 text-right font-bold">Done</th>
                  <th className="px-4 py-2.5 font-bold">Holding them up</th>
                  <th className="px-4 py-2.5 font-bold" data-print="hide" />
                </tr>
              </thead>
              <tbody>
                {team.map((row) => (
                  <tr key={row.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onPerson(row.id)}
                        className="flex items-center gap-2 font-bold text-ink underline decoration-line-strong underline-offset-4 hover:decoration-amber-deep"
                      >
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${row.heat ? HEAT_DOT[row.heat] : "bg-line"}`} />
                        <DesignAvatar name={row.name} size={26} />
                        {row.name}
                      </button>
                      <span className="ml-[52px] block text-[11px] font-light text-muted">{row.title}</span>
                    </td>
                    <Count n={row.counts.running} />
                    <Count n={row.counts.hot} tone="text-alert" />
                    <Count n={row.counts.warm} tone="text-warning" />
                    <Count n={row.counts.cold} tone="text-navy" />
                    <Count n={row.counts.done} />
                    <td className="px-4 py-2.5 font-light text-secondary">
                      {row.worst && row.worst.heat === "HOT" && row.worst.causedBy ? (
                        <>
                          <span className="font-bold text-ink">{row.worst.name}</span> —{" "}
                          <span className="font-bold text-alert">{row.worst.delayDays}d late</span> at{" "}
                          {row.worst.causedBy.task}
                          <span className="block text-[11px] text-muted">
                            depends on {row.worst.causedBy.dependsOn}
                            {row.worst.causedBy.dependsOnClient ? " · client" : ""}
                          </span>
                        </>
                      ) : row.worst && row.worst.heat === "WARM" ? (
                        <>
                          <span className="font-bold text-ink">{row.worst.name}</span> —{" "}
                          <span className="text-warning">{row.worst.dueSoon[0]?.task} due {row.worst.dueSoon[0]?.dueDate}</span>
                        </>
                      ) : row.counts.running === 0 ? (
                        <span className="text-muted">no running projects</span>
                      ) : row.worst?.heat === "NOT TRACKED" ? (
                        <span className="text-warning">
                          {row.worst.name} — no start date, not on the clock
                        </span>
                      ) : (
                        <span className="text-muted">nothing late</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right" data-print="hide">
                      <button
                        type="button"
                        onClick={() => onPerson(row.id)}
                        className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
                      >
                        Projects
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <SegmentSplit projects={projects} />

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Who is holding what</h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          Late activities, by whom the chart says they depend on — the RESPONSIBILITY column read against today.
        </p>
        {holding.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-6 text-center font-body text-sm font-light text-muted">
            Nothing is late — no dependency is holding anything up today.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left font-body text-[13.5px]">
              <thead>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                  <th className="px-4 py-2.5 font-bold">Depends on</th>
                  <th className="px-4 py-2.5 text-right font-bold">Late activities</th>
                  <th className="px-4 py-2.5 text-right font-bold">Total days late</th>
                  <th className="px-4 py-2.5 text-right font-bold">Longest</th>
                  <th className="px-4 py-2.5 font-bold">Projects</th>
                </tr>
              </thead>
              <tbody>
                {holding.map((h) => (
                  <tr key={h.dependsOn} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                    <td className="px-4 py-2.5 font-bold text-ink">{h.dependsOn}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-ink">{h.lateActivities}</td>
                    <td className="px-4 py-2.5 text-right font-light text-secondary">{h.totalDaysLate}</td>
                    <td className="px-4 py-2.5 text-right font-light text-secondary">
                      {h.longest}d
                      <span className="block text-[11px] text-muted">{h.longestProject}</span>
                    </td>
                    <td className="px-4 py-2.5 font-light text-muted">{h.projects.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">
          {selected ? `${selected.name}'s projects, hottest first` : "Every running project, hottest first"}
        </h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          Open a project for the detail — every late activity by name, and whom it depends on. Read against{" "}
          {settings.today}.
        </p>
        {running.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-secondary">
            {selected ? (
              <>
                <span className="font-bold text-ink">{selected.name}</span> has no running projects on the board —
                every figure above is zero because there is nothing to count, not because the day is clear.
              </>
            ) : (
              "No running projects on the board yet. Add them on the Projects tab."
            )}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left font-body text-[13.5px]">
              <thead>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                  <th className="px-3 py-2.5 font-bold">Project / client</th>
                  {person === null ? <th className="px-3 py-2.5 font-bold">Designer</th> : null}
                  <th className="px-3 py-2.5 font-bold">Day</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Now at</th>
                  <th className="px-3 py-2.5 font-bold">Delay caused by</th>
                  <th className="px-3 py-2.5 font-bold">Depends on</th>
                  <th className="px-3 py-2.5 font-bold" data-print="hide" />
                </tr>
              </thead>
              <tbody>
                {running.map((p) => {
                  const expanded = open === p.id;
                  const cols = person === null ? 8 : 7;
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                        <td className="px-3 py-2.5 font-light text-ink">
                          <button type="button" onClick={() => setOpen(expanded ? null : p.id)} className="text-left">
                            <span className="block font-bold">{p.name}</span>
                            <span className="block text-xs text-muted">
                              {[p.type?.label, p.client ?? "No client named"].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </td>
                        {person === null ? (
                          <td className="whitespace-nowrap px-3 py-2.5 font-light text-secondary">
                            <button
                              type="button"
                              onClick={() => onPerson(p.designerId)}
                              className="flex items-center gap-1.5 hover:text-ink"
                            >
                              <DesignAvatar name={p.designer} size={22} />
                              {p.designer}
                            </button>
                          </td>
                        ) : null}
                        <td className="px-3 py-2.5">
                          <DayBadge project={p} />
                        </td>
                        <td className="px-3 py-2.5">
                          <HeatPill heat={p.heat} />
                          {p.late.length > 1 ? (
                            <span className="mt-1 block whitespace-nowrap text-[11px] font-light text-muted">
                              {p.late.length} activities late
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5 font-light text-secondary">
                          {p.current ? (
                            <>
                              <span className="mr-1 text-muted">{p.current.code}</span>
                              {p.current.task}
                            </>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-light text-secondary">
                          {p.causedBy ? (
                            <>
                              {p.causedBy.task}
                              <span className="block text-[11px] font-bold text-alert">
                                {p.delayDays}d late · due {p.causedBy.dueDate}
                              </span>
                            </>
                          ) : p.dueSoon[0] ? (
                            <span className="text-warning">
                              {p.dueSoon[0].task} due {p.dueSoon[0].dueDate}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-light text-muted">
                          {p.causedBy ? (
                            <>
                              {p.causedBy.dependsOn}
                              {p.causedBy.dependsOnClient ? (
                                <span className="block text-[11px] font-bold text-warning">client</span>
                              ) : null}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right" data-print="hide">
                          <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : p.id)}
                            className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
                          >
                            {expanded ? "Close ▴" : "Details ▾"}
                          </button>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-t border-line bg-surface">
                          <td colSpan={cols} className="px-4 py-4">
                            <ProjectBreakdown project={p} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Count({ n, tone }: { n: number; tone?: string }) {
  return (
    <td className={`px-4 py-2.5 text-right ${n === 0 ? "font-light text-muted" : `font-bold ${tone ?? "text-ink"}`}`}>
      {n === 0 ? "—" : n}
    </td>
  );
}

/** A metric tile whose name is its colour: a bar of it, and the count. */
function HeatCard({ heat, value, sub }: { heat: Heat; value: number; sub: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-line bg-card px-5 py-4"
      title={HEAT_MEANING[heat]}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${HEAT_DOT[heat]}`} />
      <span role="img" aria-label={HEAT_MEANING[heat]} className={`inline-block h-3 w-3 rounded-full ${HEAT_DOT[heat]}`} />
      <p className="mt-2 font-body text-2xl font-light leading-tight text-white">{value}</p>
      <p className="mt-0.5 font-body text-xs font-light text-muted">{sub}</p>
    </div>
  );
}

function HeatTh({ heat }: { heat: Heat }) {
  return (
    <th className="px-4 py-2.5 text-right font-bold">
      <span
        role="img"
        aria-label={HEAT_MEANING[heat]}
        title={HEAT_MEANING[heat]}
        className={`inline-block h-2.5 w-2.5 rounded-full ${HEAT_DOT[heat]}`}
      />
    </th>
  );
}

/**
 * Residential and commercial side by side — the same colours, counted apart,
 * so the type a project was given shows up on the first page and not only in
 * a filter.
 */
function SegmentSplit({ projects }: { projects: ComputedProject[] }) {
  const running = projects.filter((p) => p.heat !== "DONE");
  if (running.length === 0) return null;
  const rows: { label: string; icon: string; rows: ComputedProject[] }[] = [
    { label: "Residential", icon: "🏠", rows: forSegment(running, "residential") },
    { label: "Commercial", icon: "🏢", rows: forSegment(running, "commercial") },
    { label: "Type not set", icon: "·", rows: running.filter((p) => p.type === null) },
  ];
  return (
    <section className="mb-10">
      <h2 className="mb-1 font-heading text-2xl text-white">Residential and commercial</h2>
      <p className="mb-3 font-body text-sm font-light text-muted">
        Running projects by kind. A project with no plot of its own — an apartment, an office — has no sanctioning
        and no site construction on its chart.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {rows.map((r) => {
          const count = (h: Heat) => r.rows.filter((p) => p.heat === h).length;
          const kinds = [...new Set(r.rows.map((p) => p.type?.label).filter(Boolean))];
          return (
            <div key={r.label} className="rounded-lg border border-line bg-card px-5 py-4">
              <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
                <span aria-hidden className="mr-1 normal-case">{r.icon}</span>
                {r.label}
              </p>
              <p className="mt-2 font-body text-2xl font-light leading-tight text-white">{r.rows.length}</p>
              <div className="mt-2 flex flex-wrap items-center gap-3 font-body text-xs text-secondary">
                {(["HOT", "WARM", "COLD"] as const).map((h) => (
                  <span key={h} className="flex items-center gap-1" title={HEAT_MEANING[h]}>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${HEAT_DOT[h]}`} />
                    {count(h)}
                  </span>
                ))}
              </div>
              <p className="mt-2 font-body text-[11px] font-light text-muted">
                {r.label === "Type not set"
                  ? r.rows.length > 0
                    ? "Pick a type on the ✓ Update tab"
                    : "Every project has a type"
                  : kinds.length > 0
                    ? kinds.join(", ")
                    : "none yet"}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** The block colour for a heat — the fill of a treemap box. */
const HEAT_BG: Record<Heat, string> = {
  HOT: "bg-alert",
  WARM: "bg-warning",
  COLD: "bg-navy",
  DONE: "bg-forest",
  "NOT TRACKED": "bg-line-strong",
};

function Panel({
  title,
  note,
  className,
  children,
}: {
  title: string;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-lg border border-line bg-card px-5 py-4 ${className ?? ""}`}>
      <h3 className="font-heading text-lg text-white">{title}</h3>
      {note ? <p className="mb-3 font-body text-xs font-light text-muted">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded border border-dashed border-line-strong px-4 py-6 text-center font-body text-sm font-light text-muted">
      {children}
    </p>
  );
}
