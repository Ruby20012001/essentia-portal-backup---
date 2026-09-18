"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ActivityBadge,
  ConfirmButton,
  DayBadge,
  HEAT_DOT,
  HEAT_MEANING,
  HeatPill,
  inputClass,
  labelClass,
  TypeBadge,
} from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import {
  activitiesSkippedByType,
  forPerson,
  type ComputedProject,
  type DesignProjectType,
  type Heat,
  type Segment,
} from "@/lib/services/design-tracker-logic";

/**
 * Screen 2 — the working table, the WIO board's WIOs tab.
 *
 * THE DAILY JOB IS ONE CONTROL: "Done today" against an activity (or its date,
 * for a correction). Everything else about a project sits in its expanded
 * panel, so the table stays scannable.
 */

type Filter = "running" | "hot" | "warm" | "cold" | "untracked" | "done" | "all";

const FILTERS: { key: Filter; label: string; heat?: Heat; test: (p: ComputedProject) => boolean }[] = [
  { key: "running", label: "Running", test: (p) => p.heat !== "DONE" },
  { key: "hot", label: "", heat: "HOT", test: (p) => p.heat === "HOT" },
  { key: "warm", label: "", heat: "WARM", test: (p) => p.heat === "WARM" },
  { key: "cold", label: "", heat: "COLD", test: (p) => p.heat === "COLD" },
  { key: "untracked", label: "No start date", test: (p) => p.heat === "NOT TRACKED" },
  { key: "done", label: "Done", test: (p) => p.heat === "DONE" },
  { key: "all", label: "All", test: () => true },
];

type Mark = { doneOn?: string | null; notApplicable?: boolean; remark?: string | null };

export function DesignProjectsView({
  board,
  person,
  segment,
  revision,
  busyId,
  onCreate,
  onPatch,
  onDelete,
  onMark,
}: {
  board: DesignBoard;
  person: string | null;
  segment: Segment | null;
  revision: number;
  busyId: string | null;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string, name: string) => void;
  onMark: (projectId: string, activityId: string, mark: Mark) => void;
}) {
  const [filter, setFilter] = useState<Filter>("running");
  const [search, setSearch] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const mine = useMemo(() => forPerson(board.projects, person), [board.projects, person]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const test = FILTERS.find((f) => f.key === filter)!.test;
    return mine
      .filter(test)
      .filter((p) =>
        q === ""
          ? true
          : [p.name, p.client, p.location, p.designer, p.notes, p.current?.task, p.type?.label]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q)),
      );
  }, [mine, filter, search]);

  const cols = person === null ? 8 : 7;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
              filter === f.key
                ? "border-line-strong bg-selected text-white"
                : "border-line bg-card text-secondary hover:bg-hover"
            }`}
          >
            {f.heat ? (
              <span
                role="img"
                aria-label={HEAT_MEANING[f.heat]}
                title={HEAT_MEANING[f.heat]}
                className={`inline-block h-2.5 w-2.5 rounded-full align-middle ${HEAT_DOT[f.heat]}`}
              />
            ) : (
              f.label
            )}
            <span className="ml-2 font-light text-muted">{mine.filter(f.test).length}</span>
          </button>
        ))}

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search project, client, type, designer…"
          className="ml-auto w-64 rounded border border-line-strong bg-card px-3 py-1.5 font-body text-sm font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none"
        />

        {board.can.manage ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded bg-forest px-3 py-1.5 font-body text-xs font-bold text-white transition-colors hover:bg-forest/90"
          >
            {adding ? "Cancel" : "Add a project"}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddProjectForm
          board={board}
          person={person}
          segment={segment}
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
                <th className="px-3 py-2.5 font-bold">Project / client</th>
                {person === null ? <th className="px-3 py-2.5 font-bold">Designer</th> : null}
                <th className="px-3 py-2.5 font-bold">Day</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold">Now at</th>
                <th className="px-3 py-2.5 font-bold">Delay caused by · depends on</th>
                <th className="px-3 py-2.5 text-right font-bold">Done</th>
                <th className="px-3 py-2.5 font-bold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const expanded = openRow === p.id;
                const busy = busyId === p.id;
                return (
                  <Fragment key={p.id}>
                    <tr className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                      <td className="px-3 py-2.5 text-ink">
                        <span className="block font-bold">{p.name}</span>
                        <span className="block text-xs font-light text-muted">
                          {[p.client, p.location].filter(Boolean).join(" · ") || "No client named"}
                        </span>
                        <TypeTag type={p.type} />
                      </td>
                      {person === null ? (
                        <td className="whitespace-nowrap px-3 py-2.5 font-light text-secondary">{p.designer}</td>
                      ) : null}
                      <td className="px-3 py-2.5">
                        <DayBadge project={p} />
                      </td>
                      <td className="px-3 py-2.5">
                        <HeatPill heat={p.heat} />
                      </td>
                      <td className="px-3 py-2.5 font-light text-secondary">
                        {p.current ? (
                          <>
                            <span className="mr-1 text-muted">{p.current.code}</span>
                            {p.current.task}
                            {p.current.state !== "Not started" ? (
                              <span className="mt-1 block">
                                <ActivityBadge activity={p.current} />
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-light text-secondary">
                        {p.causedBy ? (
                          <>
                            {p.causedBy.task}{" "}
                            <span className="font-bold text-alert">· {p.delayDays}d late</span>
                            <span className="block text-[11px] text-muted">
                              {p.causedBy.dependsOn}
                              {p.causedBy.dependsOnClient ? " · client" : ""}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-light text-secondary">
                        {p.doneCount}/{p.applicableCount}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setOpenRow(expanded ? null : p.id)}
                          className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover"
                        >
                          {expanded ? "Close ▴" : "Open ▾"}
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr className="border-t border-line bg-surface">
                        <td colSpan={cols} className="px-4 py-4">
                          <ProjectDetail
                            key={`${p.id}:${revision}`}
                            project={p}
                            board={board}
                            busy={busy}
                            onPatch={onPatch}
                            onDelete={onDelete}
                            onMark={onMark}
                          />
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
    </div>
  );
}

/** Blur-to-save, as on the WIO board: commits when you leave the field. */
function Field({
  label,
  value,
  disabled,
  type = "text",
  hint,
  onCommit,
}: {
  label: string;
  value: string;
  disabled: boolean;
  type?: "text" | "date";
  hint?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type={type}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        className={inputClass}
      />
      {hint ? <span className="mt-1 block font-body text-[11px] font-light text-muted">{hint}</span> : null}
    </label>
  );
}

function ProjectDetail({
  project: p,
  board,
  busy,
  onPatch,
  onDelete,
  onMark,
}: {
  project: ComputedProject;
  board: DesignBoard;
  busy: boolean;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onDelete: (id: string, name: string) => void;
  onMark: (projectId: string, activityId: string, mark: Mark) => void;
}) {
  const manage = board.can.manage;
  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  const today = board.settings.today;
  const phases = new Map<string, number>();
  for (const a of p.activities) if (a.phase && !phases.has(a.phase)) phases.set(a.phase, a.position);

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <Field label="Project" value={p.name} disabled={!manage || busy} onCommit={(v) => blank(v) && onPatch(p.id, { name: v.trim() })} />
        <Field label="Client" value={p.client ?? ""} disabled={!manage || busy} onCommit={(v) => onPatch(p.id, { client: blank(v) })} />
        <Field label="Location" value={p.location ?? ""} disabled={!manage || busy} onCommit={(v) => onPatch(p.id, { location: blank(v) })} />
        <label className="block">
          <span className={labelClass}>Type</span>
          <TypeSelect
            types={board.types}
            value={p.typeCode ?? ""}
            disabled={!manage || busy}
            onChange={(v) => onPatch(p.id, { typeCode: v === "" ? null : v })}
          />
          <TypeHint type={p.type} activities={board.activities} />
        </label>
        <label className="block">
          <span className={labelClass}>Designer</span>
          <select
            value={p.designerId}
            disabled={!manage || busy}
            onChange={(e) => onPatch(p.id, { designerId: e.target.value })}
            className={inputClass}
          >
            {board.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <Field
          label="Start date (day 0)"
          type="date"
          value={p.startDate ?? ""}
          disabled={!manage || busy}
          hint={p.startDate ? `Last day ${p.lastDay} falls on ${p.activities.at(-1)?.dueDate ?? "—"}` : "Until this is set the chart is not running"}
          onCommit={(v) => onPatch(p.id, { startDate: blank(v) })}
        />
        <Field
          label="Completed on"
          type="date"
          value={p.completedOn ?? ""}
          disabled={!manage || busy}
          hint="Setting this takes the project off the clock"
          onCommit={(v) => onPatch(p.id, { completedOn: blank(v) })}
        />
        <div className="md:col-span-3 lg:col-span-2">
          <Field label="Notes" value={p.notes ?? ""} disabled={busy} onCommit={(v) => onPatch(p.id, { notes: blank(v) })} />
        </div>
      </div>

      <h3 className="mb-2 mt-6 font-heading text-lg text-white">The activity chart for {p.name}</h3>
      <p className="mb-3 font-body text-xs font-light text-muted">
        &ldquo;Done today&rdquo; records it against {today}. For an earlier day, type the date. N/A takes an activity off
        this project (sanction, on-site work where there is no site).
      </p>
      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full text-left font-body text-[13px]">
          <thead>
            <tr className="bg-canvas text-[10.5px] uppercase tracking-[0.12em] text-secondary">
              <th className="px-3 py-2 font-bold">#</th>
              <th className="px-3 py-2 font-bold">Activity</th>
              <th className="px-3 py-2 font-bold">Due</th>
              <th className="px-3 py-2 font-bold">Depends on</th>
              <th className="px-3 py-2 font-bold">State</th>
              <th className="px-3 py-2 font-bold">Done on</th>
              <th className="px-3 py-2 font-bold">N/A</th>
              <th className="px-3 py-2 font-bold">Remark</th>
            </tr>
          </thead>
          <tbody>
            {p.activities.map((a) => (
              <Fragment key={a.id}>
                {a.phase && phases.get(a.phase) === a.position ? (
                  <tr className="border-t border-line bg-surface">
                    <td colSpan={8} className="px-3 py-1.5 font-body text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted">
                      {a.phase}
                    </td>
                  </tr>
                ) : null}
                <tr className={`border-t border-line align-top ${a.notApplicable ? "bg-canvas opacity-60" : "bg-card"}`}>
                  <td className="whitespace-nowrap px-3 py-2 font-light text-muted">{a.code}</td>
                  <td className="px-3 py-2 text-ink">
                    {a.task}
                    {a.detail ? <span className="mt-0.5 block text-[11px] font-light text-muted">{a.detail}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 font-light text-secondary">
                    {a.dueDate ?? "—"}
                    <span className="block text-[11px] text-muted">
                      day {a.dueDay ?? "—"}
                      {a.standardDays !== null ? ` · ${a.standardDays}d` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-light text-secondary">
                    {a.dependsOn}
                    {a.dependsOnClient ? <span className="block text-[11px] font-bold text-warning">client</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <ActivityBadge activity={a} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <DateCell
                        key={a.doneOn ?? "none"}
                        value={a.doneOn ?? ""}
                        disabled={busy || a.notApplicable}
                        onCommit={(v) => onMark(p.id, a.id, { doneOn: blank(v) })}
                      />
                      {!a.doneOn && !a.notApplicable ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onMark(p.id, a.id, { doneOn: today })}
                          className="whitespace-nowrap rounded border border-line-strong bg-canvas px-2 py-1 font-body text-[11px] font-bold text-secondary transition-colors hover:bg-hover disabled:opacity-50"
                        >
                          Done today
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={a.notApplicable}
                      disabled={busy}
                      onChange={(e) => onMark(p.id, a.id, { notApplicable: e.target.checked })}
                      className="h-4 w-4 accent-amber-deep"
                      aria-label={`${a.task} not applicable`}
                    />
                  </td>
                  <td className="min-w-[10rem] px-3 py-2">
                    <RemarkCell
                      key={a.remark ?? ""}
                      value={a.remark ?? ""}
                      disabled={busy}
                      onCommit={(v) => onMark(p.id, a.id, { remark: blank(v) })}
                    />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {manage ? (
        <div className="mt-4 flex border-t border-line pt-3">
          <ConfirmButton
            label="Remove from the board"
            question={`Remove ${p.name} and everything recorded on it?`}
            disabled={busy}
            onConfirm={() => onDelete(p.id, p.name)}
            className="ml-auto rounded border border-alert/40 px-2.5 py-1 font-body text-[12px] font-bold text-alert transition-colors hover:bg-alert/10 disabled:opacity-50"
          />
        </div>
      ) : null}
    </div>
  );
}

function DateCell({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="date"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className="rounded border border-line-strong bg-canvas px-2 py-1 font-body text-[12px] font-light text-ink focus:border-amber-deep focus:outline-none disabled:opacity-50"
    />
  );
}

function RemarkCell({ value, disabled, onCommit }: { value: string; disabled: boolean; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      value={draft}
      disabled={disabled}
      placeholder="why, if late"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      className="w-full rounded border border-line-strong bg-canvas px-2 py-1 font-body text-[12px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none disabled:opacity-50"
    />
  );
}

function AddProjectForm({
  board,
  person,
  segment,
  busy,
  onCancel,
  onCreate,
}: {
  board: DesignBoard;
  person: string | null;
  segment: Segment | null;
  busy: boolean;
  onCancel: () => void;
  onCreate: (input: Record<string, unknown>) => Promise<boolean>;
}) {
  const designers = board.people;
  // Defaults to the designer being looked at; never guessed when looking at everybody.
  const [designerId, setDesignerId] = useState(person ?? "");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [doneThrough, setDoneThrough] = useState("");
  const [notes, setNotes] = useState("");
  const [typeCode, setTypeCode] = useState("");
  const blank = (v: string) => (v.trim() === "" ? null : v.trim());
  const type = board.types.find((t) => t.code === typeCode) ?? null;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await onCreate({
          name: name.trim(),
          designerId,
          typeCode: typeCode || null,
          client: blank(client),
          location: blank(location),
          startDate: blank(startDate),
          notes: blank(notes),
          doneThroughPosition: doneThrough ? Number(doneThrough) : null,
        });
      }}
      className="mb-6 rounded-lg border border-line bg-card px-5 py-4"
    >
      <h3 className="mb-3 font-heading text-lg text-white">Add a project to the board</h3>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className={labelClass}>Project *</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Designer *</span>
          <select required value={designerId} onChange={(e) => setDesignerId(e.target.value)} className={inputClass}>
            <option value="" disabled>
              Pick whose project
            </option>
            {designers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Type</span>
          <TypeSelect
            types={board.types.filter((t) => segment === null || t.segment === segment)}
            value={typeCode}
            disabled={false}
            onChange={setTypeCode}
          />
          <TypeHint type={type} activities={board.activities} />
        </label>
        <label className="block">
          <span className={labelClass}>Client</span>
          <input value={client} onChange={(e) => setClient(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Location</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Start date (day 0)</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          <span className="mt-1 block font-body text-[11px] font-light text-muted">
            The day of the project lead follow-up. Blank = no start date.
          </span>
        </label>
        <label className="block lg:col-span-2">
          <span className={labelClass}>Already done up to</span>
          <select
            value={doneThrough}
            disabled={!startDate}
            onChange={(e) => setDoneThrough(e.target.value)}
            className={inputClass}
          >
            <option value="">Nothing yet — a new project</option>
            {board.activities.map((a) => (
              <option key={a.id} value={a.position}>
                {a.code}. {a.task}
              </option>
            ))}
          </select>
          <span className="mt-1 block font-body text-[11px] font-light text-muted">
            For a project already under way: everything up to here is recorded done on its due day.
          </span>
        </label>
        <label className="block">
          <span className={labelClass}>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={busy || name.trim() === "" || designerId === ""}
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


/** Residential and commercial, grouped as the list is. */
function TypeSelect({
  types,
  value,
  disabled,
  onChange,
}: {
  types: DesignProjectType[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const groups: { label: string; segment: Segment }[] = [
    { label: "Residential", segment: "residential" },
    { label: "Commercial", segment: "commercial" },
  ];
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inputClass}>
      <option value="">Not said yet</option>
      {groups.map((g) =>
        types.some((t) => t.segment === g.segment) ? (
          <optgroup key={g.segment} label={g.label}>
            {types
              .filter((t) => t.segment === g.segment)
              .map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
          </optgroup>
        ) : null,
      )}
    </select>
  );
}

/** What the type does to the chart, said where it is chosen. */
function TypeHint({
  type,
  activities,
}: {
  type: DesignProjectType | null;
  activities: DesignBoard["activities"];
}) {
  if (!type) {
    return (
      <span className="mt-1 block font-body text-[11px] font-light text-muted">
        The type decides whether sanctioning and site construction apply.
      </span>
    );
  }
  const skipped = activitiesSkippedByType(type, activities);
  return (
    <span className="mt-1 block font-body text-[11px] font-light text-muted">
      {skipped.length > 0
        ? `No plot of its own — ${skipped.map((a) => a.task.toLowerCase()).join(" and ")} marked N/A.`
        : "Its own plot — sanctioning and site construction stay on the chart."}
    </span>
  );
}

function TypeTag({ type }: { type: DesignProjectType | null }) {
  if (!type) return null;
  return (
    <span className="mt-1 block">
      <TypeBadge type={type} />
    </span>
  );
}
