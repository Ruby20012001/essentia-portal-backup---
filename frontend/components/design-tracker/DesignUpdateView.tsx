"use client";

import { useMemo, useState } from "react";
import {
  HEAT_CLASS,
  HEAT_DOT,
  HEAT_MEANING,
  inputClass,
  TypeBadge,
} from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import {
  forPerson,
  type ComputedActivity,
  type ComputedProject,
  type DesignProjectType,
  NO_PLOT_REMARK,
} from "@/lib/services/design-tracker-logic";

/** What one press did, so the card can offer to take it back. */
type Pressed = { activityIds: string[]; label: string; what: "done" | "skipped" };

/** Late activities listed before "show the rest". */
const SHOW_LATE = 4;

/**
 * Update — the shortcut (Monica, 17 Sep 2026: going to a name, opening a
 * project and ticking activities one by one was too much).
 *
 * One card per running project, nothing to open. The card says the one thing
 * to do now and has one button for it. Pressing it records the activity done
 * today and the card moves on to the next — so the daily job is: look at the
 * card, press Done, carry on. Everything else that is late is listed under it,
 * each with its own Done, and one button clears the lot for a designer who is
 * catching up. Every press is one Undo away, on the card that made it.
 */
export function DesignUpdateView({
  board,
  person,
  busyId,
  onMarkDone,
  onSkip,
  onSetStart,
  onSetType,
}: {
  board: DesignBoard;
  person: string | null;
  busyId: string | null;
  /** doneOn null = undo. Resolves true when the server took it. */
  onMarkDone: (projectId: string, activityIds: string[], doneOn: string | null) => Promise<boolean>;
  onSkip: (projectId: string, activityId: string, notApplicable: boolean) => Promise<boolean>;
  onSetStart: (projectId: string, startDate: string) => void;
  onSetType: (projectId: string, typeCode: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [last, setLast] = useState<Record<string, Pressed>>({});

  const cards = useMemo(() => {
    const q = search.trim().toLowerCase();
    return forPerson(board.projects, person)
      .filter((p) => p.heat !== "DONE")
      .filter((p) =>
        q === ""
          ? true
          : [p.name, p.client, p.designer, p.type?.label]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [board.projects, person, search]);

  const today = board.settings.today;
  const remember = (projectId: string, pressed: Pressed | null) =>
    setLast((m) => {
      const next = { ...m };
      if (pressed) next[projectId] = pressed;
      else delete next[projectId];
      return next;
    });

  const done = async (p: ComputedProject, acts: ComputedActivity[]) => {
    const ok = await onMarkDone(p.id, acts.map((a) => a.id), today);
    if (ok) {
      remember(p.id, {
        activityIds: acts.map((a) => a.id),
        label: acts.length === 1 ? acts[0]!.task : `${acts.length} activities`,
        what: "done",
      });
    }
  };

  const skip = async (p: ComputedProject, a: ComputedActivity) => {
    if (await onSkip(p.id, a.id, true)) {
      remember(p.id, { activityIds: [a.id], label: a.task, what: "skipped" });
    }
  };

  const undo = async (p: ComputedProject) => {
    const l = last[p.id];
    if (!l) return;
    const ok =
      l.what === "done"
        ? await onMarkDone(p.id, l.activityIds, null)
        : await onSkip(p.id, l.activityIds[0]!, false);
    if (ok) remember(p.id, null);
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-card px-5 py-3">
        <p className="font-body text-sm font-light text-secondary">
          <span className="font-bold text-ink">How to update:</span> each card shows what is due now. Finished it?
          Press <span className="font-bold text-forest">✓ Done</span> — the card moves to the next activity. Pressed
          by mistake? Press <span className="font-bold text-ink">Undo</span>.
        </p>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Find a project…"
          className="ml-auto w-56 rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-sm font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none"
        />
      </div>

      {cards.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
          {search ? "No project matches." : "No running projects to update."}
        </p>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {cards.map((p) => (
            <Card
              key={p.id}
              project={p}
              showDesigner={person === null}
              busy={busyId === p.id}
              last={last[p.id]}
              canSetStart={board.can.manage}
              today={today}
              onSetStart={(d) => onSetStart(p.id, d)}
              types={board.types}
              onSetType={(code) => onSetType(p.id, code)}
              onDone={(acts) => void done(p, acts)}
              onSkip={(a) => void skip(p, a)}
              onUndo={() => void undo(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  project: p,
  showDesigner,
  busy,
  last,
  canSetStart,
  today,
  onSetStart,
  types,
  onSetType,
  onDone,
  onSkip,
  onUndo,
}: {
  project: ComputedProject;
  showDesigner: boolean;
  busy: boolean;
  last?: Pressed;
  canSetStart: boolean;
  today: string;
  onSetStart: (startDate: string) => void;
  types: DesignProjectType[];
  onSetType: (typeCode: string) => void;
  onDone: (acts: ComputedActivity[]) => void;
  onSkip: (a: ComputedActivity) => void;
  onUndo: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // The activities this project's type took off its chart — named on the card.
  const skippedByType = p.activities.filter((a) => a.notApplicable && a.remark === NO_PLOT_REMARK);
  const now = p.current;
  // Late ones other than "now", worst first — each gets its own Done.
  const otherLate = p.late.filter((a) => a.id !== now?.id);
  const allLate = p.late;
  const shown = showAll ? otherLate : otherLate.slice(0, SHOW_LATE);
  const next = p.activities.find(
    (a) => !a.doneOn && !a.notApplicable && a.id !== now?.id && !otherLate.some((l) => l.id === a.id),
  );
  const nowTone =
    now && (now.state === "HOT" || now.state === "WARM" || now.state === "COLD")
      ? HEAT_CLASS[now.state]
      : "border-line-strong";

  return (
    <div className={`relative overflow-hidden rounded-lg border border-line bg-card transition-opacity ${busy ? "opacity-60" : ""}`}>
      <span className={`absolute inset-y-0 left-0 w-1.5 ${HEAT_DOT[p.heat]}`} title={HEAT_MEANING[p.heat]} />

      <div className="px-5 pb-4 pl-6 pt-4">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="font-heading text-xl text-white">{p.name}</h3>
          <span className="font-body text-xs font-light text-muted">
            {[showDesigner ? p.designer : null, p.client].filter(Boolean).join(" · ")}
          </span>
          <span className="ml-auto whitespace-nowrap font-body text-xs text-muted">
            {p.day !== null ? `Day ${p.day} / ${p.lastDay} · ` : ""}
            {p.doneCount}/{p.applicableCount} done
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {p.type ? (
            <TypeBadge type={p.type} />
          ) : canSetStart ? (
            <label className="flex items-center gap-2 font-body text-xs font-light text-muted">
              What kind of project?
              <select
                value=""
                disabled={busy}
                onChange={(e) => e.target.value && onSetType(e.target.value)}
                className="rounded border border-warning/50 bg-warning/5 px-2 py-1 font-body text-xs text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
              >
                <option value="">Pick a type…</option>
                <optgroup label="🏠 Residential">
                  {types.filter((t) => t.segment === "residential").map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </optgroup>
                <optgroup label="🏢 Commercial">
                  {types.filter((t) => t.segment === "commercial").map((t) => (
                    <option key={t.code} value={t.code}>{t.label}</option>
                  ))}
                </optgroup>
              </select>
            </label>
          ) : (
            <span className="font-body text-xs font-light text-muted">Type not set</span>
          )}
          {skippedByType.length > 0 ? (
            <span className="font-body text-[11px] font-light text-muted">
              Not on this project (no plot of its own): {skippedByType.map((a) => a.task).join(", ")}
            </span>
          ) : null}
        </div>

        {last ? (
          <div className="mb-3 flex items-center gap-3 rounded border border-forest/30 bg-forest/5 px-3 py-2 font-body text-[13px]">
            <span className="text-forest">
              ✓ <span className="font-bold">{last.label}</span>{" "}
              {last.what === "done" ? "marked done" : "marked not needed"}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={onUndo}
              className="ml-auto rounded border border-line-strong bg-canvas px-2.5 py-1 font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
            >
              Undo
            </button>
          </div>
        ) : null}

        {p.heat === "NOT TRACKED" ? (
          <StartDate canSet={canSetStart} busy={busy} today={today} onSet={onSetStart} />
        ) : now ? (
          <div className={`rounded border px-4 py-3 ${nowTone}`}>
            <p className="font-body text-[10.5px] font-bold uppercase tracking-[0.14em] opacity-80">Now</p>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-body text-base font-bold text-ink">{now.task}</p>
                <p className="font-body text-xs font-light text-secondary">
                  {dueText(now)} · depends on {now.dependsOn}
                  {now.dependsOnClient ? " · client" : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDone([now])}
                className="rounded bg-forest px-5 py-2 font-body text-sm font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
              >
                ✓ Done
              </button>
            </div>
            {now.optional ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onSkip(now)}
                className="mt-2 font-body text-xs font-light text-muted underline decoration-line-strong underline-offset-2 hover:text-ink disabled:opacity-50"
              >
                Not needed for this project
              </button>
            ) : null}
          </div>
        ) : null}

        {otherLate.length > 0 ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <p className="font-body text-[10.5px] font-bold uppercase tracking-[0.14em] text-alert">
                {now?.state === "HOT" ? "Also late" : "Late"} · {otherLate.length}
              </p>
              {allLate.length > 1 ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Mark all ${allLate.length} late activities on ${p.name} done today?`)) {
                      onDone(allLate);
                    }
                  }}
                  className="ml-auto rounded border border-forest/50 px-2.5 py-1 font-body text-xs font-bold text-forest transition-colors hover:bg-forest/10 disabled:opacity-50"
                >
                  ✓ All {allLate.length} late are done
                </button>
              ) : null}
            </div>
            <ul className="divide-y divide-line rounded border border-line">
              {shown.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-alert" />
                  <div className="min-w-0 flex-1 font-body text-[13px]">
                    <span className="text-ink">{a.task}</span>
                    <span className="block text-[11px] font-light text-muted">
                      {dueText(a)} · {a.dependsOn}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDone([a])}
                    className="shrink-0 rounded border border-forest/50 px-3 py-1 font-body text-xs font-bold text-forest transition-colors hover:bg-forest/10 disabled:opacity-50"
                  >
                    ✓ Done
                  </button>
                </li>
              ))}
            </ul>
            {otherLate.length > SHOW_LATE ? (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="mt-1.5 font-body text-xs font-light text-muted underline decoration-line-strong underline-offset-2 hover:text-ink"
              >
                {showAll ? "Show fewer" : `Show ${otherLate.length - SHOW_LATE} more`}
              </button>
            ) : null}
          </div>
        ) : null}

        {next && p.heat !== "NOT TRACKED" ? (
          <p className="mt-3 font-body text-xs font-light text-muted">
            Next: <span className="text-secondary">{next.task}</span> · {dueText(next)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function dueText(a: ComputedActivity): string {
  if (a.daysToDue === null) return a.dueDate ? `due ${a.dueDate}` : "no due day";
  if (a.daysToDue < 0) return `${-a.daysToDue} days late (was due ${a.dueDate})`;
  if (a.daysToDue === 0) return "due today";
  if (a.daysToDue === 1) return "due tomorrow";
  return `due in ${a.daysToDue} days (${a.dueDate})`;
}

/** A project with no day 0 cannot have anything due — set it right here. */
function StartDate({
  canSet,
  busy,
  today,
  onSet,
}: {
  canSet: boolean;
  busy: boolean;
  today: string;
  onSet: (date: string) => void;
}) {
  const [date, setDate] = useState(today);
  if (!canSet) {
    return (
      <p className="rounded border border-dashed border-line-strong px-4 py-3 font-body text-sm font-light text-secondary">
        No start date yet, so nothing can be due. Ask Vishakha to add it.
      </p>
    );
  }
  return (
    <div className="rounded border border-dashed border-line-strong px-4 py-3">
      <p className="mb-2 font-body text-sm font-light text-secondary">
        No start date yet, so nothing can be due. When did this project start?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputClass} w-auto`}
        />
        <button
          type="button"
          disabled={busy || date === ""}
          onClick={() => onSet(date)}
          className="rounded bg-forest px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
        >
          Set start date
        </button>
      </div>
    </div>
  );
}
