"use client";

import { useMemo, useState } from "react";
import { DayBadge, HEAT_DOT, HEAT_MEANING, HeatPill } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, type Heat } from "@/lib/services/design-tracker-logic";

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
        return running.filter((p) => p.late.some((a) => a.dependsOn === focus.name));
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

  const byDependency = (() => {
    const map = new Map<string, { name: string; count: number; days: number }>();
    for (const p of running) {
      for (const a of p.late) {
        const row = map.get(a.dependsOn) ?? { name: a.dependsOn, count: 0, days: 0 };
        row.count += 1;
        row.days += a.daysLate ?? 0;
        map.set(a.dependsOn, row);
      }
    }
    return [...map.values()].sort((a, b) => b.days - a.days).slice(0, 6);
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
          Click any bar to narrow the page to it. Read against {board.settings.today}.
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
            <>
              <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded">
                {byHeat.map((r) => (
                  <button
                    key={r.heat}
                    type="button"
                    title={`${r.count} ${HEAT_WORD[r.heat]}`}
                    onClick={() =>
                      setFocus(
                        focus.kind === "heat" && focus.heat === r.heat
                          ? { kind: "none" }
                          : { kind: "heat", heat: r.heat },
                      )
                    }
                    style={{ flexGrow: r.count }}
                    // A number on a pale grey segment must not be white — it wears ink there.
                    className={`flex items-center justify-center font-body text-xs font-bold transition-opacity hover:opacity-90 ${
                      r.heat === "NOT TRACKED" ? "text-ink" : "text-cream"
                    } ${
                      HEAT_DOT[r.heat]
                    } ${focus.kind === "heat" && focus.heat !== r.heat ? "opacity-40" : ""}`}
                  >
                    {r.count}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                {byHeat.map((r) => (
                  <span key={r.heat} className="flex items-center gap-1.5 font-body text-xs font-light text-secondary">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${HEAT_DOT[r.heat]}`} />
                    {HEAT_WORD[r.heat]} <span className="font-bold text-ink">{r.count}</span>
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* ── late activities by designer ──────────────────────────── */}
        <Panel
          title="Late activities by designer"
          note="Solid — held by us. Lines — waiting on the client. Click a name for their projects."
        >
          {byDesigner.length === 0 ? (
            <Empty>Nobody has a running project.</Empty>
          ) : (
            <BarRows
              max={Math.max(1, ...byDesigner.map((d) => d.total))}
              rows={byDesigner.map((d) => ({
                key: d.id,
                label: d.name,
                value: d.total,
                parts: [
                  { value: d.internal, pattern: false, title: `${d.internal} held by us` },
                  { value: d.client, pattern: true, title: `${d.client} waiting on the client` },
                ],
                sub: `${d.projects} running${d.hot > 0 ? ` · ${d.hot} late` : ""}`,
                active: focus.kind === "designer" && focus.id === d.id,
                onClick: () =>
                  setFocus(
                    focus.kind === "designer" && focus.id === d.id
                      ? { kind: "none" }
                      : { kind: "designer", id: d.id, name: d.name },
                  ),
              }))}
            />
          )}
        </Panel>
      </div>

      {/* ── who the delay waits on ─────────────────────────────────── */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Who the delay is waiting on"
          note="Total days late, by the chart's RESPONSIBILITY. Click one to see its projects."
        >
          {byDependency.length === 0 ? (
            <Empty>Nothing is late.</Empty>
          ) : (
            <BarRows
              max={Math.max(1, ...byDependency.map((d) => d.days))}
              rows={byDependency.map((d) => ({
                key: d.name,
                label: d.name,
                value: d.days,
                unit: "d",
                parts: [{ value: d.days, pattern: false, title: `${d.days} days late in total` }],
                sub: `${d.count} ${d.count === 1 ? "activity" : "activities"}`,
                active: focus.kind === "dependency" && focus.name === d.name,
                onClick: () =>
                  setFocus(
                    focus.kind === "dependency" && focus.name === d.name
                      ? { kind: "none" }
                      : { kind: "dependency", name: d.name },
                  ),
              }))}
            />
          )}
        </Panel>

        {/* ── how far each project has got ─────────────────────────── */}
        <Panel title="How far each project has got" note={`Day by day, out of the chart's ${running[0]?.lastDay ?? 238}.`}>
          {shown.length === 0 ? (
            <Empty>Nothing to show.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {shown.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <div className="mb-1 flex items-baseline gap-2 font-body text-xs">
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${HEAT_DOT[p.heat]}`} title={HEAT_MEANING[p.heat]} />
                    <span className="truncate text-ink">{p.name}</span>
                    <span className="ml-auto whitespace-nowrap font-light text-muted">
                      {p.day !== null ? `day ${p.day} / ${p.lastDay}` : "no start date"}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded bg-line-strong/70" title={`${p.doneCount} of ${p.applicableCount} activities done`}>
                    <div
                      className={`h-full rounded ${HEAT_DOT[p.heat]}`}
                      style={{ width: `${Math.min(100, Math.round((p.doneCount / Math.max(1, p.applicableCount)) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-0.5 font-body text-[11px] font-light text-muted">
                    {p.doneCount}/{p.applicableCount} activities done
                    {p.causedBy ? ` · ${p.delayDays}d late at ${p.causedBy.task}` : ""}
                  </p>
                </li>
              ))}
              {shown.length > 8 ? (
                <li className="font-body text-xs font-light text-muted">and {shown.length - 8} more below</li>
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
                        <button type="button" onClick={() => onPerson(p.designerId)} className="hover:text-ink">
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

/** Horizontal bars, label on the left, value direct-labelled at the end. */
function BarRows({
  rows,
  max,
}: {
  max: number;
  rows: {
    key: string;
    label: string;
    value: number;
    unit?: string;
    sub?: string;
    active: boolean;
    onClick: () => void;
    parts: { value: number; pattern: boolean; title: string }[];
  }[];
}) {
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={r.onClick}
            className={`w-full rounded px-1 py-1 text-left transition-colors hover:bg-hover ${r.active ? "bg-hover" : ""}`}
          >
            <span className="flex items-baseline gap-2 font-body text-[13px]">
              <span className="truncate text-ink">{r.label}</span>
              {r.sub ? <span className="truncate text-[11px] font-light text-muted">{r.sub}</span> : null}
              <span className="ml-auto whitespace-nowrap font-bold text-ink">
                {r.value}
                {r.unit ?? ""}
              </span>
            </span>
            <span className="mt-1 flex h-3 w-full items-stretch gap-[2px]">
              {r.value === 0 ? (
                <span className="h-full w-full rounded bg-line-strong/70" />
              ) : (
                <>
                  {r.parts
                    .filter((p) => p.value > 0)
                    .map((p, i) => (
                      // Solid = held by us. Diagonal lines = waiting on the
                      // client: the same red, carrying a second signal. The
                      // fill is a token class — an inline `background`
                      // shorthand was dropped and left every bar empty.
                      <span
                        key={i}
                        title={p.title}
                        className={`h-full rounded ${p.pattern ? "bg-alert/25" : "bg-alert"}`}
                        style={{
                          width: `${(p.value / max) * 100}%`,
                          backgroundImage: p.pattern
                            ? "repeating-linear-gradient(45deg, rgb(var(--c-error)) 0 3px, transparent 3px 6px)"
                            : undefined,
                        }}
                      />
                    ))}
                  <span className="h-full flex-1 rounded bg-line-strong/70" />
                </>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
