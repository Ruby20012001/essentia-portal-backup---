"use client";

import { useMemo, useState } from "react";
import { DayBadge, StatusPill } from "@/components/wio-tracker/StatusPill";
import type { TrackerBoard } from "@/lib/services/wio-tracker";
import type { ComputedWio } from "@/lib/services/wio-tracker-logic";

/**
 * Screen 2 — the working table.
 *
 * THE DAILY JOB IS ONE CONTROL: the Stage dropdown. Changing it PATCHes the
 * row and the server re-stamps `since` to the board's stamped date in the same
 * write. In the workbook that was two manual steps and the second one got
 * forgotten, which made "days here" quietly wrong and the board with it. One
 * action, both fields, no way to do half of it.
 *
 * Everything else is edited in the row's expanded panel, so the table stays
 * scannable and the field that matters is never one of nine identical inputs.
 */

type Filter = "running" | "attention" | "untracked" | "released" | "all";

const FILTERS: { key: Filter; label: string; describe: (b: TrackerBoard) => number }[] = [
  { key: "running", label: "Running", describe: (b) => b.wios.filter((w) => !w.pioReleased).length },
  {
    key: "attention",
    label: "Needs attention",
    describe: (b) => b.wios.filter((w) => w.status === "OVERDUE" || w.status === "LATE HERE" || w.status === "At risk").length,
  },
  { key: "untracked", label: "No WIO date", describe: (b) => b.wios.filter((w) => !w.pioReleased && !w.wioIssued).length },
  { key: "released", label: "Released", describe: (b) => b.wios.filter((w) => w.pioReleased).length },
  { key: "all", label: "All", describe: (b) => b.wios.length },
];

export function WiosView({
  board,
  busyId,
  onPatch,
  onCreate,
  onDelete,
}: {
  board: TrackerBoard;
  busyId: string | null;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
  onDelete: (wio: ComputedWio) => void;
}) {
  const [filter, setFilter] = useState<Filter>("running");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return board.wios
      .filter((w) => {
        if (filter === "running") return !w.pioReleased;
        if (filter === "released") return Boolean(w.pioReleased);
        if (filter === "untracked") return !w.pioReleased && !w.wioIssued;
        if (filter === "attention")
          return w.status === "OVERDUE" || w.status === "LATE HERE" || w.status === "At risk";
        return true;
      })
      .filter((w) =>
        q === ""
          ? true
          : [w.wio, w.project, w.scope, w.raisedBy, w.stage, w.notes]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [board.wios, filter, search]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const count = f.describe(board);
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
                active
                  ? "border-line-strong bg-selected text-white"
                  : "border-line bg-card text-secondary hover:bg-hover"
              }`}
            >
              {f.label}
              <span className="ml-2 font-light text-muted">{count}</span>
            </button>
          );
        })}

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search WIO, project, scope, person…"
          className="ml-auto w-64 rounded border border-line-strong bg-card px-3 py-1.5 font-body text-sm font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none"
        />

        {board.can.create ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded bg-forest px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90"
          >
            {adding ? "Cancel" : "Add a WIO"}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddWioForm
          board={board}
          busy={busyId === "create"}
          onCancel={() => setAdding(false)}
          onCreate={async (input) => {
            const ok = await onCreate(input);
            if (ok) setAdding(false);
            return ok;
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
          Nothing matches this filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2.5 font-bold">WIO</th>
                <th className="px-3 py-2.5 font-bold">Project / scope</th>
                <th className="px-3 py-2.5 font-bold">Stage — change this</th>
                <th className="px-3 py-2.5 font-bold">Day</th>
                <th className="px-3 py-2.5 font-bold text-right">Days here</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Accountability</th>
                <th className="px-3 py-2.5 font-bold">Upcoming</th>
                <th className="px-3 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => {
                const busy = busyId === w.id;
                const expanded = openRow === w.id;
                return (
                  <FragmentRow
                    key={w.id}
                    w={w}
                    board={board}
                    busy={busy}
                    expanded={expanded}
                    onToggle={() => setOpenRow(expanded ? null : w.id)}
                    onPatch={onPatch}
                    onDelete={onDelete}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  w,
  board,
  busy,
  expanded,
  onToggle,
  onPatch,
  onDelete,
}: {
  w: ComputedWio;
  board: TrackerBoard;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (wio: ComputedWio) => void;
}) {
  const editable = board.can.edit;
  return (
    <>
      <tr className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
        <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">
          {w.wio}
          {w.pioNo ? (
            <span className="block font-body text-[11px] font-light text-muted">
              PIO {w.pioNo}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2.5 font-light text-ink">
          {w.project ?? <span className="text-muted">No project named</span>}
          <span className="block text-xs text-muted">{w.scope}</span>
        </td>
        <td className="px-3 py-2.5">
          {/* The one control that moves the board. Changing it re-stamps
              `since` server-side — see updateTrackerWio. */}
          <select
            value={w.stageId}
            disabled={!editable || busy || Boolean(w.pioReleased)}
            onChange={(e) => onPatch(w.id, { stageId: e.target.value })}
            className="w-full min-w-[11rem] rounded border border-line-strong bg-canvas px-2 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
          >
            {board.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.position}. {s.stage}
              </option>
            ))}
          </select>
        </td>
        <td className="px-3 py-2.5">
          <DayBadge
            label={w.dayLabel}
            daysLeft={w.daysLeft}
            atRiskFrom={board.settings.atRiskFrom}
          />
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
        <td className="px-3 py-2.5 font-light text-secondary">{w.accountability}</td>
        <td className="px-3 py-2.5 font-light text-muted">{w.upcomingStage}</td>
        <td className="px-3 py-2.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
          >
            {expanded ? "Close" : editable ? "Edit" : "Details"}
          </button>
        </td>
      </tr>

      {expanded ? (
        <tr className="border-t border-line bg-surface">
          <td colSpan={9} className="px-4 py-4">
            <RowDetail w={w} board={board} busy={busy} onPatch={onPatch} onDelete={onDelete} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Blur-to-save: the field commits when you leave it, never on every keystroke. */
function Field({
  label,
  value,
  disabled,
  type = "text",
  hint,
  options,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: "text" | "date";
  hint?: string;
  options?: string[];
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const listId = options ? `opt-${label.replace(/\s+/g, "-")}` : undefined;

  return (
    <label className="block">
      <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      <input
        type={type}
        value={draft}
        list={listId}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
      />
      {options ? (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ) : null}
      {hint ? (
        <span className="mt-1 block font-body text-[11px] font-light text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

function RowDetail({
  w,
  board,
  busy,
  onPatch,
  onDelete,
}: {
  w: ComputedWio;
  board: TrackerBoard;
  busy: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (wio: ComputedWio) => void;
}) {
  const disabled = !board.can.edit || busy;
  const blank = (v: string) => (v.trim() === "" ? null : v.trim());

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Field
          label="Project"
          value={w.project ?? ""}
          disabled={disabled}
          onCommit={(v) => onPatch(w.id, { project: blank(v) })}
        />
        <Field
          label="Scope"
          value={w.scope ?? ""}
          disabled={disabled}
          onCommit={(v) => onPatch(w.id, { scope: blank(v) })}
        />
        <Field
          label="Raised by"
          value={w.raisedBy ?? ""}
          disabled={disabled}
          options={board.people}
          hint={w.stage === "PIO" ? "Holds accountability at the PIO stage" : undefined}
          onCommit={(v) => onPatch(w.id, { raisedBy: blank(v) })}
        />
        <Field
          label="WIO issued"
          type="date"
          value={w.wioIssued ?? ""}
          disabled={disabled}
          hint={w.wioIssued ? `PIO due ${w.pioDue}` : "Until this is set the clock is not running"}
          onCommit={(v) => onPatch(w.id, { wioIssued: blank(v) })}
        />
        <Field
          label="At this stage since"
          type="date"
          value={w.since ?? ""}
          disabled={disabled}
          hint="Re-stamped automatically when the stage changes"
          onCommit={(v) => onPatch(w.id, { since: blank(v) })}
        />
        <Field
          label="PIO released"
          type="date"
          value={w.pioReleased ?? ""}
          disabled={disabled}
          hint="Setting this takes the row off the clock"
          onCommit={(v) => onPatch(w.id, { pioReleased: blank(v) })}
        />
        <Field
          label="PIO number"
          value={w.pioNo ?? ""}
          disabled={disabled}
          onCommit={(v) => onPatch(w.id, { pioNo: blank(v) })}
        />
        <Field
          label="Notes"
          value={w.notes ?? ""}
          disabled={disabled}
          onCommit={(v) => onPatch(w.id, { notes: blank(v) })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line pt-3 font-body text-[12px] font-light text-muted">
        <span>
          This stage must clear by{" "}
          <span className="text-secondary">{w.thisStageDue ?? "—"}</span>
          {w.stageDoneBy > 0 ? ` (${w.stageDoneBy}d before the PIO date)` : " (the PIO date itself)"}
        </span>
        <span>
          PIO due <span className="text-secondary">{w.pioDue ?? "—"}</span>
        </span>
        <span>
          Next: <span className="text-secondary">{w.upcomingStage}</span>
        </span>
        {board.can.delete ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(w)}
            className="ml-auto rounded border border-alert/40 px-2.5 py-1 font-bold text-alert transition-colors hover:bg-alert/10 disabled:opacity-50"
          >
            Remove from the board
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AddWioForm({
  board,
  busy,
  onCancel,
  onCreate,
}: {
  board: TrackerBoard;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const first = board.stages[0];
  const [wio, setWio] = useState("");
  const [project, setProject] = useState("");
  const [scope, setScope] = useState("");
  const [raisedBy, setRaisedBy] = useState("");
  const [wioIssued, setWioIssued] = useState("");
  const [stageId, setStageId] = useState(first?.id ?? "");
  const [notes, setNotes] = useState("");

  const blank = (v: string) => (v.trim() === "" ? null : v.trim());

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onCreate({
          wio: wio.trim(),
          project: blank(project),
          scope: blank(scope),
          raisedBy: blank(raisedBy),
          wioIssued: blank(wioIssued),
          stageId,
          notes: blank(notes),
        });
        if (ok) {
          setWio("");
          setProject("");
          setScope("");
          setRaisedBy("");
          setWioIssued("");
          setNotes("");
        }
      }}
      className="mb-6 rounded-lg border border-line bg-card px-5 py-4"
    >
      <h3 className="mb-3 font-heading text-lg text-white">Add a WIO to the board</h3>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            WIO number *
          </span>
          <input
            required
            value={wio}
            onChange={(e) => setWio(e.target.value)}
            placeholder="ED/26-27/138"
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Project
          </span>
          <input
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Scope
          </span>
          <input
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Raised by
          </span>
          <input
            value={raisedBy}
            list="add-people"
            onChange={(e) => setRaisedBy(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
          <datalist id="add-people">
            {board.people.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            WIO issued
          </span>
          <input
            type="date"
            value={wioIssued}
            onChange={(e) => setWioIssued(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
          <span className="mt-1 block font-body text-[11px] font-light text-muted">
            Leave blank if it has not been issued — the row reads &ldquo;Not tracked&rdquo;
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Stage
          </span>
          <select
            value={stageId}
            onChange={(e) => setStageId(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          >
            {board.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.position}. {s.stage}
              </option>
            ))}
          </select>
        </label>
        <label className="block lg:col-span-2">
          <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Notes
          </span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink focus:border-amber-deep focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || wio.trim() === ""}
          className="rounded bg-forest px-4 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add to the board"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-line-strong bg-canvas px-4 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
