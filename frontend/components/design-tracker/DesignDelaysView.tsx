"use client";

import { Fragment, useState } from "react";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { HeatPill, ProjectBreakdown } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, personRows } from "@/lib/services/design-tracker-logic";

type Source = "all" | "internal" | "client";

/**
 * Screen 3 — Delays. Where the WIO board keeps a log somebody writes, this
 * one is read straight off the chart: a delay is an activity past its due day.
 * Nobody has to remember to log it, and it closes itself when the activity is
 * recorded done.
 *
 * Grouped by designer, because the question Vishakha asks is "why is Lavika
 * late" — and the answer is a project, opened to the activity and whom it
 * depends on.
 */
export function DesignDelaysView({
  board,
  person,
  onPerson,
}: {
  board: DesignBoard;
  person: string | null;
  onPerson: (id: string | null) => void;
}) {
  const [source, setSource] = useState<Source>("all");
  const [open, setOpen] = useState<string | null>(null);

  const people = personRows(forPerson(board.projects, person), board.people).filter(
    (row) => row.counts.hot > 0,
  );

  const matches = (dependsOnClient: boolean) =>
    source === "all" || (source === "client" ? dependsOnClient : !dependsOnClient);

  const allLate = forPerson(board.projects, person).flatMap((p) => (p.heat === "HOT" ? p.late : []));
  const sources: { key: Source; label: string; count: number }[] = [
    { key: "all", label: "All late activities", count: allLate.length },
    { key: "internal", label: "Internal", count: allLate.filter((a) => !a.dependsOnClient).length },
    { key: "client", label: "Waiting on the client", count: allLate.filter((a) => a.dependsOnClient).length },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {sources.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
              source === s.key
                ? "border-line-strong bg-selected text-white"
                : "border-line bg-card text-secondary hover:bg-hover"
            }`}
          >
            {s.label}
            <span className="ml-2 font-light text-muted">{s.count}</span>
          </button>
        ))}
        <span className="ml-auto font-body text-xs font-light text-muted">
          A delay here is an activity past its due day. It clears itself when the activity is recorded done.
        </span>
      </div>

      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
          Nothing is late{person ? ` for ${board.people.find((p) => p.id === person)?.name}` : ""} — no project is past an
          activity&rsquo;s due day.
        </p>
      ) : null}

      {people.map((row) => {
        const hot = forPerson(board.projects, row.id).filter(
          (p) => p.heat === "HOT" && p.late.some((a) => matches(a.dependsOnClient)),
        );
        if (hot.length === 0) return null;
        return (
          <section key={row.id} className="mb-8">
            <div className="mb-2 flex flex-wrap items-baseline gap-3">
              <h2 className="flex items-center gap-2 font-heading text-2xl text-white">
                <DesignAvatar name={row.name} size={30} />
                {row.name}
              </h2>
              <span className="font-body text-sm font-light text-muted">
                {row.counts.hot} {row.counts.hot === 1 ? "project" : "projects"} late · {row.counts.lateActivities} late{" "}
                {row.counts.lateActivities === 1 ? "activity" : "activities"}
              </span>
              {person === null ? (
                <button
                  type="button"
                  onClick={() => onPerson(row.id)}
                  data-print="hide"
                  className="font-body text-xs font-light text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
                >
                  only {row.name}
                </button>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-left font-body text-[13.5px]">
                <thead>
                  <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                    <th className="px-3 py-2.5 font-bold">Project</th>
                    <th className="px-3 py-2.5 font-bold">Status</th>
                    <th className="px-3 py-2.5 text-right font-bold">Days late</th>
                    <th className="px-3 py-2.5 font-bold">Delay caused by</th>
                    <th className="px-3 py-2.5 font-bold">Depends on</th>
                    <th className="px-3 py-2.5 font-bold">Also late</th>
                    <th className="px-3 py-2.5 font-bold" data-print="hide" />
                  </tr>
                </thead>
                <tbody>
                  {hot.map((p) => {
                    const late = p.late.filter((a) => matches(a.dependsOnClient));
                    const cause = late[0]!;
                    const key = `${row.id}:${p.id}`;
                    const expanded = open === key;
                    return (
                      <Fragment key={p.id}>
                        <tr className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                          <td className="px-3 py-2.5 text-ink">
                            <span className="block font-bold">{p.name}</span>
                            <span className="block text-xs font-light text-muted">
                              {[p.type?.label, p.client ?? "No client named"].filter(Boolean).join(" · ")}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <HeatPill heat={p.heat} />
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-alert">{cause.daysLate}d</td>
                          <td className="px-3 py-2.5 font-light text-secondary">
                            <span className="mr-1 text-muted">{cause.code}</span>
                            {cause.task}
                            <span className="block text-[11px] text-muted">due {cause.dueDate} (day {cause.dueDay})</span>
                          </td>
                          <td className="px-3 py-2.5 font-light text-secondary">
                            {cause.dependsOn}
                            {cause.dependsOnClient ? (
                              <span className="block text-[11px] font-bold text-warning">depends on the client</span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 font-light text-muted">
                            {late.length > 1
                              ? late
                                  .slice(1)
                                  .map((a) => `${a.task} (${a.daysLate}d)`)
                                  .join(" · ")
                              : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right" data-print="hide">
                            <button
                              type="button"
                              onClick={() => setOpen(expanded ? null : key)}
                              className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
                            >
                              {expanded ? "Close ▴" : "Details ▾"}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-line bg-surface">
                            <td colSpan={7} className="px-4 py-4">
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
          </section>
        );
      })}
    </div>
  );
}
