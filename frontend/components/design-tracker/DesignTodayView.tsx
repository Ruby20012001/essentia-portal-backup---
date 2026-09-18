"use client";

import { Fragment, useState } from "react";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { BigNumber, Gauge, Treemap } from "@/components/design-tracker/DesignCharts";
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
  teamsWaitedOn,
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

  /**
   * Who is sitting on the team's work — counted in TASKS off the activity
   * chart, which is the unit the chart itself uses and the one a designer
   * chases in.
   *
   * It used to total the days late instead, and that number misled: ten tasks
   * overdue at the same time added to "228 days late" on a board whose worst
   * project was fifty days behind. Nobody is 228 days behind anything. A count
   * of tasks cannot be read that way, and "the oldest has waited 50 days" says
   * the urgency without inventing a quantity.
   *
   * A task naming two teams counts under both — it really is sitting with both
   * of them — so these do not sum to the number of late tasks, and the panel
   * says so rather than inviting the addition.
   */
  const waitingOn = (() => {
    type Row = {
      team: string;
      tasks: number;
      oldestDays: number;
      oldestTask: string;
      oldestProject: string;
    };
    const map = new Map<string, Row>();
    for (const p of running) {
      for (const a of p.late) {
        for (const team of teamsWaitedOn(a.dependsOn)) {
          const row =
            map.get(team) ??
            { team, tasks: 0, oldestDays: -1, oldestTask: "", oldestProject: "" };
          row.tasks += 1;
          if ((a.daysLate ?? 0) > row.oldestDays) {
            row.oldestDays = a.daysLate ?? 0;
            row.oldestTask = a.task;
            row.oldestProject = p.name;
          }
          map.set(team, row);
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.tasks - a.tasks || b.oldestDays - a.oldestDays)
      .slice(0, 5);
  })();
  const mostTasks = Math.max(1, ...waitingOn.map((r) => r.tasks));
  /* Not the same row as the busiest team: the pile and the single oldest task
     are different questions, and it is the oldest that usually wants chasing. */
  const longestWait = [...waitingOn].sort((a, b) => b.oldestDays - a.oldestDays)[0] ?? null;

  /**
   * What has actually moved — the page's namesake (Monica, 18 Sep: "what's new
   * me daalna bhi naam se related, kya kya naya ayega usme").
   *
   * Renaming the tab was not enough on its own: a board that always shows the
   * same standing totals is not "what's new" whatever it is called. These are
   * the four kinds of change somebody coming back after a few days needs, each
   * read fresh off the dates rather than stored, so nothing here can go stale:
   * work ticked off, work that has just slipped, work about to fall due, and
   * projects that have only now started running.
   *
   * A week is the window because the team looks at this on Mondays and after a
   * site visit — a day would show almost nothing, a month would stop being news.
   */
  const NEWS_DAYS = 7;
  const since = isoShift(settings.today, -NEWS_DAYS);
  const news = (() => {
    const finished: NewsItem[] = [];
    const slipped: NewsItem[] = [];
    const dueNext: NewsItem[] = [];
    const started: NewsItem[] = [];

    for (const p of projects) {
      if (p.startDate && p.startDate > since && p.startDate <= settings.today) {
        started.push({ key: p.id, project: p.name, designer: p.designer, task: "Project started", when: p.startDate });
      }
      for (const a of p.activities) {
        if (a.doneOn && a.doneOn > since && a.doneOn <= settings.today) {
          finished.push({ key: `${p.id}:${a.id}`, project: p.name, designer: p.designer, task: a.task, when: a.doneOn });
        }
      }
      // Slipped INSIDE the window: anything older was already late last week
      // and is not news — it is on the red list above.
      for (const a of p.late) {
        const d = a.daysLate ?? 0;
        if (d > 0 && d <= NEWS_DAYS) {
          slipped.push({ key: `${p.id}:${a.id}`, project: p.name, designer: p.designer, task: a.task, when: a.dueDate ?? "", days: d });
        }
      }
      for (const a of p.dueSoon) {
        const d = a.daysToDue ?? 0;
        if (d >= 0 && d <= NEWS_DAYS) {
          dueNext.push({ key: `${p.id}:${a.id}`, project: p.name, designer: p.designer, task: a.task, when: a.dueDate ?? "", days: d });
        }
      }
    }
    const newestFirst = (a: NewsItem, b: NewsItem) => b.when.localeCompare(a.when);
    const soonestFirst = (a: NewsItem, b: NewsItem) => (a.days ?? 0) - (b.days ?? 0);
    return {
      finished: finished.sort(newestFirst),
      slipped: slipped.sort((a, b) => (a.days ?? 0) - (b.days ?? 0)),
      dueNext: dueNext.sort(soonestFirst),
      started: started.sort(newestFirst),
    };
  })();
  const nothingNew =
    news.finished.length + news.slipped.length + news.dueNext.length + news.started.length === 0;

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

      {/* The answer in words, and first (Monica, 18 Sep: "non technical wale ko
          aram se samajh aa jaye"). Everything under it is this same paragraph
          drawn — so somebody who does not read charts can stop here and still
          know what today needs. It used to sit below the visuals, which meant
          the plainest thing on the page was the last thing reached. */}
      {hot.length > 0 ? (
        <div className="mb-4 rounded-lg border-l-4 border-alert bg-alert/5 px-5 py-4">
          <p className="mb-2 font-body text-base font-bold text-alert">
            {hot.length} of {counts.running} {counts.running === 1 ? "project" : "projects"}{" "}
            {hot.length === 1 ? "is" : "are"} running late.
          </p>
          <ul className="space-y-1.5 font-body text-sm font-light text-ink">
            {hot.slice(0, 4).map((p) => (
              <li key={p.id}>
                <span className="font-bold">{p.name}</span>
                {person === null ? ` (${p.designer})` : ""} is{" "}
                <span className="font-bold">
                  {p.delayDays} {p.delayDays === 1 ? "day" : "days"} late
                </span>
                , waiting on {p.causedBy?.dependsOn}.{" "}
                <span className="text-muted">Stuck at: {p.causedBy?.task}.</span>
              </li>
            ))}
            {hot.length > 4 ? (
              <li className="text-muted">
                and {hot.length - 4} more — see the Delays tab.
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {counts.notTracked > 0 ? (
        <div className="mb-4 rounded-lg border-l-4 border-warning bg-warning/5 px-5 py-3">
          <p className="font-body text-sm font-light text-ink">
            <span className="font-bold text-warning">
              {counts.notTracked} {counts.notTracked === 1 ? "project has" : "projects have"} no start
              date.
            </span>{" "}
            Nothing can be late until a project has a start date, so{" "}
            {counts.notTracked === 1 ? "it is" : "they are"} not counted above. Add the date on the
            Projects tab.
          </p>
        </div>
      ) : null}

      {/* The tab's namesake: what has moved in the last week. */}
      <section className="mb-8 rounded-lg border border-line bg-card px-5 py-4">
        <h2 className="font-heading text-2xl text-white">What&rsquo;s new</h2>
        <p className="mb-4 font-body text-sm font-light text-muted">
          Everything that has changed since {shortDate(since)} — ticked off, slipped, or coming up.
        </p>
        {nothingNew ? (
          <p className="font-body text-sm font-light text-muted">
            Nothing has moved in the last {NEWS_DAYS} days — nothing ticked off, nothing newly late,
            nothing falling due this week.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            <NewsList
              title="Finished"
              tone="text-forest"
              items={news.finished}
              say={(i) => `done ${shortDate(i.when)}`}
            />
            <NewsList
              title="Just went late"
              tone="text-alert"
              items={news.slipped}
              say={(i) => `${i.days} ${i.days === 1 ? "day" : "days"} over, due ${shortDate(i.when)}`}
            />
            <NewsList
              title="Due this week"
              tone="text-warning"
              items={news.dueNext}
              say={(i) =>
                i.days === 0 ? "due today" : `due ${shortDate(i.when)}, in ${i.days} ${i.days === 1 ? "day" : "days"}`
              }
            />
            <NewsList
              title="Just started"
              tone="text-navy"
              items={news.started}
              say={(i) => `started ${shortDate(i.when)}`}
            />
          </div>
        )}
      </section>

      <p className="mb-8 font-body text-sm font-light text-muted">
        The pictures below say the same thing, drawn.
      </p>

      {/* The page as a board of visuals (Monica, 18 Sep, with a Power BI page
          for reference): work done month by month, the projects as a treemap,
          then who the delay waits on, how far the team has got, and the two
          numbers that lead. Every mark says its own value. */}
      <div className="mb-8 grid gap-4 lg:grid-cols-12">
        {/* The month-by-month column chart stood here. Gone (Monica, 18 Sep:
            "ye month wala htado"): on a page that is now explicitly about the
            last seven days, a six-month history was answering a question
            nobody had come to this tab to ask. The Finished list above covers
            the same ground for the window that matters. */}

        <Panel
          className="lg:col-span-12"
          title="Which projects are furthest behind"
          note="Bigger means later. Colour is its status — click one for that designer."
        >
          {treemap.length === 0 ? (
            <Empty>No running projects.</Empty>
          ) : (
            <Treemap groups={treemap} />
          )}
        </Panel>

        <Panel
          className="lg:col-span-8"
          title="Who we are waiting for"
          note="Tasks off the chart that are overdue, by whose desk they are on. A task waiting on two teams shows under both."
        >
          {waitingOn.length === 0 ? (
            <Empty>Nothing is late.</Empty>
          ) : (
            /* A table (Monica, 18 Sep: "table format me bnadio"). The bar that
               was here compared one thing — how many tasks — and everything
               else had to hang off it as a caption. Columns let the count, the
               longest wait and the task itself sit side by side, each read down
               its own column, and give the oldest task the width to be named
               rather than truncated. The panel takes two thirds of the row for
               the same reason; a table in a third of a row is a list.

               The count keeps a bar behind it, drawn inside the cell — the
               ranking stays visible at a glance without a column of its own. */
            <div className="overflow-x-auto">
              {/* Said in sentences first, then the table (Monica, 18 Sep:
                  "vaakya upar, table neeche"). Somebody in a hurry reads three
                  lines and leaves; somebody chasing it reads down the columns.
                  Two different readers, one panel, neither made to do the
                  other's work. */}
              <ul className="mb-4 space-y-1 font-body text-sm font-light text-ink">
                <li>
                  <span className="font-bold">{counts.lateActivities}</span>{" "}
                  {counts.lateActivities === 1 ? "task is" : "tasks are"} overdue across the team.
                </li>
                <li>
                  <span className="font-bold">{waitingOn[0]!.team}</span> has the most —{" "}
                  <span className="font-bold">{waitingOn[0]!.tasks}</span> of them, the oldest waiting{" "}
                  <span className="font-bold">
                    {waitingOn[0]!.oldestDays} {waitingOn[0]!.oldestDays === 1 ? "day" : "days"}
                  </span>
                  .
                </li>
                {/* Only when it is somebody else — otherwise it repeats the
                    line above in different words. */}
                {longestWait && longestWait.team !== waitingOn[0]!.team ? (
                  <li>
                    The single longest wait is{" "}
                    <span className="font-bold">{longestWait.team}</span>&rsquo;s —{" "}
                    <span className="font-bold">
                      {longestWait.oldestDays} {longestWait.oldestDays === 1 ? "day" : "days"}
                    </span>{" "}
                    on {longestWait.oldestProject}.
                  </li>
                ) : null}
              </ul>
              <table className="w-full text-left font-body text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                    <th className="py-2 pr-3 font-bold">Waiting on</th>
                    <th className="py-2 pr-3 font-bold">Tasks overdue</th>
                    <th className="py-2 pr-3 text-right font-bold">Longest</th>
                    <th className="py-2 font-bold">That task</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {waitingOn.map((r, i) => (
                    <tr key={r.team}>
                      <td className="py-2.5 pr-3 font-bold text-ink">{r.team}</td>
                      <td className="py-2.5 pr-3">
                        <span className="flex items-center gap-2">
                          <span className="w-4 shrink-0 font-bold text-ink">{r.tasks}</span>
                          <span className="h-2 w-full min-w-[3rem] overflow-hidden rounded-sm bg-hover">
                            <span
                              className={`block h-full rounded-sm ${BAR_STEP[i] ?? "bg-alert/30"}`}
                              style={{ width: `${Math.max(4, (r.tasks / mostTasks) * 100)}%` }}
                            />
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right font-bold text-alert">
                        {r.oldestDays}d
                      </td>
                      <td className="py-2.5 text-secondary">
                        {r.oldestTask}
                        <span className="text-muted"> · {r.oldestProject}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* The gauge and the two numbers share the remaining third, stacked,
            now that the table has taken two thirds of the row. */}
        <div className="grid gap-4 lg:col-span-4">
          <Panel title="How much is finished" note="Steps ticked off, across every running project.">
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

      {/* The per-designer table used to sit here. It is the Team performance
          tab now (Monica, 18 Sep) — the same facts, a card each, and one fewer
          long table on a page that was already repeating itself. */}

      <SegmentSplit projects={projects} />

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Who we are waiting for, in full</h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          The same people as the circle above, with the numbers behind it. Who a step waits on comes from the
          activity chart&rsquo;s own RESPONSIBILITY column.
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
          {selected
            ? `${selected.name}'s projects, worst first`
            : "Every running project, worst first"}
        </h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          Press Details on any row to see every late step by name, and who each one is waiting on. Read
          against {settings.today}.
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

/** One hue, stepped — this is magnitude, not identity, so no new colours. */
const BAR_STEP = ["bg-alert", "bg-alert/80", "bg-alert/60", "bg-alert/45", "bg-alert/30"];

type NewsItem = {
  key: string;
  project: string;
  designer: string;
  task: string;
  /** The date the change happened, or the date it is due. */
  when: string;
  /** Days late, or days until due, depending on the list. */
  days?: number;
};

/**
 * An ISO date, moved by whole days. UTC throughout, because these dates are
 * plain calendar days off the chart — giving them a local time zone is how a
 * date silently becomes the day before.
 */
function isoShift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "18 Sep" — the chart's dates said the way the team says them. */
function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** One block of the What's new list. Renders nothing when it has nothing. */
function NewsList({
  title,
  tone,
  items,
  say,
}: {
  title: string;
  tone: string;
  items: NewsItem[];
  say: (i: NewsItem) => string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`mb-1.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] ${tone}`}>
        {title} · {items.length}
      </p>
      <ul className="space-y-1">
        {items.slice(0, 6).map((i) => (
          <li key={i.key} className="font-body text-[13px] font-light text-ink">
            <span className="font-bold">{i.task}</span>{" "}
            <span className="text-muted">
              — {i.project} ({i.designer}) · {say(i)}
            </span>
          </li>
        ))}
        {items.length > 6 ? (
          <li className="font-body text-[12px] font-light text-muted">
            and {items.length - 6} more
          </li>
        ) : null}
      </ul>
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
