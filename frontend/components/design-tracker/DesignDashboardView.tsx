"use client";

import { useMemo, useState } from "react";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { Donut, Ring } from "@/components/design-tracker/DesignDonut";
import { DayBadge, HEAT_DOT, HEAT_MEANING, HeatPill } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, type Heat, teamsWaitedOn } from "@/lib/services/design-tracker-logic";

/**
 * Dashboard — the first page, read rather than worked (Monica, 18 Sep:
 * "kuch PowerBI me jo dashboard hote hai waisa krdo").
 *
 * It answers four questions in one screen: how many projects are late, whose
 * they are, who the delay is waiting on, and how far each project has got.
 * Every chart is a FILTER: click a bar, a segment or a row and the whole page
 * narrows to it — the cross-filtering that makes a dashboard worth opening.
 *
 * COLOUR IS THE TRACKER'S OWN STATUS LANGUAGE — red late, orange due soon,
 * blue on time, green done — never a decorative palette. Where two things
 * share a colour (late by us, late waiting on the client) the second carries
 * diagonal lines as well, because on a white screen a second red-ish hue is
 * not reliably distinguishable (validated).
 */

type Focus =
  | { kind: "none" }
  | { kind: "heat"; heat: Heat }
  | { kind: "designer"; id: string; name: string }
  | { kind: "dependency"; name: string };

/** The arc/ring colour for a heat — the same tokens as the dots, as text-* so SVG can use currentColor. */
const HEAT_TEXT: Record<Heat, string> = {
  HOT: "text-alert",
  WARM: "text-warning",
  COLD: "text-navy",
  DONE: "text-forest",
  "NOT TRACKED": "text-line-strong",
};

const HEAT_ORDER: Heat[] = ["HOT", "WARM", "COLD", "NOT TRACKED"];
const HEAT_WORD: Record<Heat, string> = {
  HOT: "late",
  WARM: "due soon",
  COLD: "on time",
  DONE: "done",
  "NOT TRACKED": "no start date",
};
export function DesignDashboardView({
  board,
  person,
  onPerson,
}: {
  board: DesignBoard;
  person: string | null;
  onPerson: (id: string | null) => void;
}) {
  const [focus, setFocus] = useState<Focus>({ kind: "none" });

  const inLens = useMemo(() => forPerson(board.projects, person), [board.projects, person]);
  const running = useMemo(() => inLens.filter((p) => p.heat !== "DONE"), [inLens]);

  /** What the whole page is narrowed to — the charts stay whole, the list narrows. */
  const shown = useMemo(() => {
    switch (focus.kind) {
      case "heat":
        return running.filter((p) => p.heat === focus.heat);
      case "designer":
        return running.filter((p) => p.designerId === focus.id);
      case "dependency":
        // Matched against the split team names, not the raw column: the bars
        // now say "CRM", and CRM's work sits on rows whose RESPONSIBILITY reads
        // "CRM · ID team" and "CRM (follow up) · Architecture (…)". Comparing
        // the whole string would have found none of them and filtered the page
        // down to nothing.
        return running.filter((p) =>
          p.late.some((a) => teamsWaitedOn(a.dependsOn).includes(focus.name)),
        );
      default:
        return running;
    }
  }, [running, focus]);

  const lateActivities = shown.flatMap((p) => p.late);
  const clientLate = lateActivities.filter((a) => a.dependsOnClient).length;
  const worst = [...shown].sort((a, b) => b.delayDays - a.delayDays)[0];

  // ── the three charts, each computed over the lens, not the focus ──
  const byHeat = HEAT_ORDER.map((heat) => ({
    heat,
    count: running.filter((p) => p.heat === heat).length,
  })).filter((r) => r.count > 0);

  const byDesigner = board.people
    .map((d) => {
      const mine = running.filter((p) => p.designerId === d.id);
      const late = mine.flatMap((p) => p.late);
      return {
        id: d.id,
        name: d.name,
        projects: mine.length,
        hot: mine.filter((p) => p.heat === "HOT").length,
        internal: late.filter((a) => !a.dependsOnClient).length,
        client: late.filter((a) => a.dependsOnClient).length,
        total: late.length,
      };
    })
    .filter((d) => d.projects > 0 || d.total > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  /**
   * Who the overdue work is sitting with — by TEAM, and counted in tasks.
   *
   * Two things were wrong with reading the chart's RESPONSIBILITY column whole
   * (Monica, 18 Sep, pointing at this panel). The labels were unreadable —
   * "CRM (follow up) · Procurement (hiring, work order) · Architecture (drawing
   * coordination)" as one bar — and because every combination made its own row,
   * CRM's actual share was scattered across five of them and visible in none.
   *
   * And the measure was days summed, which on this board reads as a claim
   * nobody means: ten tasks overdue at once totalled "228 days late" where the
   * worst project is fifty days behind. Tasks cannot be misread that way, and
   * the longest single wait carries the urgency.
   *
   * A task naming two teams counts under both, so these do not add up to the
   * number of late tasks. The panel's note says so.
   */
  const byDependency = (() => {
    type Row = {
      name: string;
      count: number;
      longest: number;
      longestTask: string;
      longestProject: string;
    };
    const map = new Map<string, Row>();
    for (const p of running) {
      for (const a of p.late) {
        for (const team of teamsWaitedOn(a.dependsOn)) {
          const row =
            map.get(team) ?? { name: team, count: 0, longest: -1, longestTask: "", longestProject: "" };
          row.count += 1;
          if ((a.daysLate ?? 0) > row.longest) {
            row.longest = a.daysLate ?? 0;
            row.longestTask = a.task;
            row.longestProject = p.name;
          }
          map.set(team, row);
        }
      }
    }
    return [...map.values()]
      .sort((a, b) => b.count - a.count || b.longest - a.longest)
      .slice(0, 6);
  })();

  const focusLabel =
    focus.kind === "heat"
      ? `${HEAT_WORD[focus.heat]} projects`
      : focus.kind === "designer"
        ? focus.name
        : focus.kind === "dependency"
          ? `waiting on ${focus.name}`
          : null;

  return (
    <div>
      {/* What the page is showing, and the way back. */}
      {focusLabel ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-deep/50 bg-amber-deep/5 px-4 py-2">
          <span className="font-body text-sm font-light text-secondary">
            Showing <span className="font-bold text-ink">{focusLabel}</span> — {shown.length}{" "}
            {shown.length === 1 ? "project" : "projects"}
          </span>
          <button
            type="button"
            onClick={() => setFocus({ kind: "none" })}
            className="ml-auto rounded border border-line-strong bg-canvas px-3 py-1 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="mb-4 font-body text-sm font-light text-muted">
          Click any piece, ring or row to narrow the page to it. Read against {board.settings.today}.
        </p>
      )}

      {/* ── the headline numbers ───────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Tile label="Running" value={shown.length} />
        <Tile label="Late" value={shown.filter((p) => p.heat === "HOT").length} dot="HOT" />
        <Tile label="Due soon" value={shown.filter((p) => p.heat === "WARM").length} dot="WARM" />
        <Tile label="On time" value={shown.filter((p) => p.heat === "COLD").length} dot="COLD" />
        <Tile label="Late activities" value={lateActivities.length} sub={`${clientLate} waiting on the client`} />
        <Tile
          label="Worst delay"
          value={worst && worst.delayDays > 0 ? worst.delayDays : 0}
          sub={worst && worst.delayDays > 0 ? `days · ${worst.name}` : "nothing late"}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* ── projects by status: one stacked bar, part-to-whole ───── */}
        <Panel
          title="Projects by status"
          note="Every running project, by its colour. Click a piece to see only those."
        >
          {running.length === 0 ? (
            <Empty>No running projects.</Empty>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                total={running.length}
                centreValue={running.length}
                centreLabel="running"
                slices={byHeat.map((r) => ({
                  key: r.heat,
                  label: HEAT_WORD[r.heat],
                  value: r.count,
                  tone: HEAT_TEXT[r.heat],
                  dimmed: focus.kind === "heat" && focus.heat !== r.heat,
                  onClick: () =>
                    setFocus(
                      focus.kind === "heat" && focus.heat === r.heat
                        ? { kind: "none" }
                        : { kind: "heat", heat: r.heat },
                    ),
                }))}
              />
              <ul className="min-w-[9rem] flex-1 space-y-1.5">
                {byHeat.map((r) => (
                  <li key={r.heat}>
                    <button
                      type="button"
                      onClick={() =>
                        setFocus(
                          focus.kind === "heat" && focus.heat === r.heat
                            ? { kind: "none" }
                            : { kind: "heat", heat: r.heat },
                        )
                      }
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 font-body text-[13px] transition-colors hover:bg-hover ${
                        focus.kind === "heat" && focus.heat === r.heat ? "bg-hover" : ""
                      }`}
                    >
                      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${HEAT_DOT[r.heat]}`} />
                      <span className="text-secondary">{HEAT_WORD[r.heat]}</span>
                      <span className="ml-auto font-bold text-ink">{r.count}</span>
                      <span className="w-10 text-right font-light text-muted">
                        {Math.round((r.count / running.length) * 100)}%
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        {/* ── each designer as a ring: how much of their work is late ── */}
        <Panel
          title="Each designer"
          note="The ring counts projects — how many of theirs are late. The line under it counts the activities inside those projects."
        >
          {byDesigner.length === 0 ? (
            <Empty>Nobody has a running project.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {byDesigner.map((d) => {
                const active = focus.kind === "designer" && focus.id === d.id;
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setFocus(active ? { kind: "none" } : { kind: "designer", id: d.id, name: d.name })
                      }
                      className={`flex w-[7.5rem] flex-col items-center rounded-lg px-2 py-2 transition-colors hover:bg-hover ${
                        active ? "bg-hover" : ""
                      }`}
                    >
                      {/* The ring counts PROJECTS; the line under it counts
                          ACTIVITIES. Both are wanted, and "1/2" beside "4 late
                          activities" read as a contradiction until the ring
                          said what it was counting (Monica, 18 Sep). */}
                      <Ring
                        value={d.hot}
                        total={Math.max(1, d.projects)}
                        tone={d.hot > 0 ? "text-alert" : "text-navy"}
                        centre={`${d.hot}/${d.projects}`}
                        sub="projects"
                        title={`${d.name}: ${d.hot} of ${d.projects} projects late, ${d.total} activities late in them`}
                      />
                      <span className="mt-1.5 flex items-center gap-1.5 font-body text-[13px] font-bold text-ink">
                        <DesignAvatar name={d.name} size={20} />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="font-body text-[11px] font-light text-muted">
                        {d.total === 0
                          ? "nothing late"
                          : `${d.total} ${d.total === 1 ? "activity" : "activities"} late in them`}
                      </span>
                      {d.client > 0 ? (
                        <span className="font-body text-[11px] font-light text-warning">
                          {d.client} waiting on the client
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── who the delay waits on ─────────────────────────────────── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Who we are waiting for"
          note="Overdue tasks, by whose desk they are on. A task waiting on two teams shows under both. Click one to see its projects."
        >
          {byDependency.length === 0 ? (
            <Empty>Nothing is late.</Empty>
          ) : (
            /* A table, not bars (Monica, 18 Sep: "isko is format se hata kar
               normal table de do"). The bar length only ever encoded the task
               count, which the column states outright, and it cost the row the
               width that the team name and the task actually needed.

               Rows stay the filter they were: a whole row is the click target,
               and the chosen one is marked rather than merely hovered, because
               with the bars gone there is no other sign the page is narrowed. */
            <table className="w-full text-left font-body text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-3 font-bold">Waiting on</th>
                  <th className="py-2 pr-3 text-right font-bold">Tasks</th>
                  <th className="py-2 text-right font-bold">Longest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byDependency.map((d) => {
                  const on = focus.kind === "dependency" && focus.name === d.name;
                  const pick = () =>
                    setFocus(on ? { kind: "none" } : { kind: "dependency", name: d.name });
                  return (
                    /* The bars this replaced were buttons, so they answered the
                       keyboard. A row with an onClick does not, so it is given
                       the focus and the keys back by hand — otherwise the whole
                       filter would have quietly become mouse-only. */
                    <tr
                      key={d.name}
                      onClick={pick}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pick();
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={on}
                      aria-label={`Show projects waiting on ${d.name}`}
                      className={`cursor-pointer transition-colors ${on ? "bg-selected" : "hover:bg-hover"}`}
                    >
                      <td className="py-2.5 pr-3">
                        <span className="block font-bold text-ink">{d.name}</span>
                        <span className="block text-[11px] font-light text-muted">
                          {d.longestTask} · {d.longestProject}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right font-bold text-ink">
                        {d.count}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right font-bold text-alert">
                        {d.longest}d
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        {/* ── each project as a ring: how much of its chart is done ─── */}
        <Panel title="How far each project has got" note="The ring is the share of its activities already done.">
          {shown.length === 0 ? (
            <Empty>Nothing to show.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-4">
              {shown.slice(0, 8).map((p) => (
                <li key={p.id} className="flex w-[7.5rem] flex-col items-center px-1">
                  <Ring
                    value={p.doneCount}
                    total={Math.max(1, p.applicableCount)}
                    tone={HEAT_TEXT[p.heat]}
                    centre={`${Math.round((p.doneCount / Math.max(1, p.applicableCount)) * 100)}%`}
                    sub={`${p.doneCount}/${p.applicableCount}`}
                    title={`${p.name}: ${p.doneCount} of ${p.applicableCount} activities done${
                      p.causedBy ? `, ${p.delayDays} days late at ${p.causedBy.task}` : ""
                    }`}
                  />
                  <span className="mt-1.5 flex items-center gap-1.5 text-center">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${HEAT_DOT[p.heat]}`} title={HEAT_MEANING[p.heat]} />
                    <span className="truncate font-body text-[12px] text-ink">{p.name}</span>
                  </span>
                  <span className="font-body text-[11px] font-light text-muted">
                    {p.day !== null ? `day ${p.day} / ${p.lastDay}` : "no start date"}
                  </span>
                </li>
              ))}
              {shown.length > 8 ? (
                <li className="self-center font-body text-xs font-light text-muted">
                  and {shown.length - 8} more below
                </li>
              ) : null}
            </ul>
          )}
        </Panel>
      </div>

      {/* ── the projects themselves ────────────────────────────────── */}
      <section>
        <h2 className="mb-1 font-heading text-2xl text-white">
          {focusLabel ? `Projects — ${focusLabel}` : "Every running project, worst first"}
        </h2>
        <p className="mb-3 font-body text-sm font-light text-muted">
          The same rows the charts above are counting.
        </p>
        {shown.length === 0 ? (
          <Empty>No project matches this selection.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left font-body text-[13.5px]">
              <thead>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                  <th className="px-3 py-2.5 font-bold">Project</th>
                  {person === null ? <th className="px-3 py-2.5 font-bold">Designer</th> : null}
                  <th className="px-3 py-2.5 font-bold">Day</th>
                  <th className="px-3 py-2.5 font-bold">Status</th>
                  <th className="px-3 py-2.5 font-bold">Delay caused by</th>
                  <th className="px-3 py-2.5 font-bold">Depends on</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                    <td className="px-3 py-2.5 text-ink">
                      <span className="block font-bold">{p.name}</span>
                      <span className="block text-xs font-light text-muted">
                        {[p.type?.label, p.client].filter(Boolean).join(" · ") || "No client named"}
                      </span>
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
                    </td>
                    <td className="px-3 py-2.5 font-light text-secondary">
                      {p.causedBy ? (
                        <>
                          {p.causedBy.task}
                          <span className="block text-[11px] font-bold text-alert">{p.delayDays}d late</span>
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-light text-muted">
                      {p.causedBy ? p.causedBy.dependsOn : "—"}
                      {p.causedBy?.dependsOnClient ? (
                        <span className="block text-[11px] font-bold text-warning">client</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, dot }: { label: string; value: number; sub?: string; dot?: Heat }) {
  return (
    <div className="rounded-lg border border-line bg-card px-4 py-3">
      <p className="flex items-center gap-1.5 font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
        {dot ? <span className={`inline-block h-2.5 w-2.5 rounded-full ${HEAT_DOT[dot]}`} title={HEAT_MEANING[dot]} /> : null}
        {label}
      </p>
      <p className="mt-1.5 font-body text-3xl font-light leading-none text-white">{value}</p>
      {sub ? <p className="mt-1 font-body text-[11px] font-light text-muted">{sub}</p> : null}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card px-5 py-4">
      <h3 className="font-heading text-lg text-white">{title}</h3>
      <p className="mb-3 font-body text-xs font-light text-muted">{note}</p>
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

