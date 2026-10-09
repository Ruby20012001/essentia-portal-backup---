"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { downloadSheet, SaveBar } from "@/components/team-weekly/SaveBar";
import type { TeamWeeklyBoard as Board, WeeklyEntry, WeeklyStatus } from "@/lib/services/team-weekly";

/**
 * The Team Weekly Board — the WIO board's shape (tab strip, team chips,
 * metric cards, a table) over Jiya's own weekly log. Two tabs: the week's
 * list, and Performance. Everything is read for one Monday-to-Sunday week.
 */

type Tab = "work" | "performance";

const STATUS_LABEL: Record<WeeklyStatus, string> = {
  done: "Done",
  progress: "In progress",
  // Stored as "pending"; said as "Delay", the word the team uses (9 Oct).
  pending: "Delay",
};
/**
 * Where an entry can go next, as buttons in front of Remove (Monica, 9 Oct):
 * a Delay can move to In progress or straight to Done, In progress to Done,
 * and Done stays done. Forward only — nothing is ever moved back by accident.
 */
const MOVES: Record<WeeklyStatus, WeeklyStatus[]> = {
  pending: ["progress", "done"],
  progress: ["done"],
  done: [],
};
// Green done, orange in hand, red for a delay — it is the one that needs a look.
const STATUS_CLASS: Record<WeeklyStatus, string> = {
  done: "border-forest/40 bg-forest/10 text-forest",
  progress: "border-warning/40 bg-warning/10 text-warning",
  pending: "border-alert/40 bg-alert/10 text-alert",
};
const MOVE_CLASS: Record<WeeklyStatus, string> = {
  done: "border-forest/50 text-forest hover:bg-forest/10",
  progress: "border-warning/50 text-warning hover:bg-warning/10",
  pending: "",
};

const label = "font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted";
const input =
  "w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none";

function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function dayString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(s: string): string {
  const d = parseDay(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayString(d);
}
function shiftDays(s: string, n: number): string {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return dayString(d);
}
function short(s: string): string {
  return parseDay(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function qty(rows: WeeklyEntry[]): number {
  return rows.reduce((sum, r) => sum + r.qty, 0);
}
function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

export function TeamWeeklyBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [tab, setTab] = useState<Tab>("work");
  const [team, setTeam] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [week, setWeek] = useState(mondayOf(initial.today));
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const weekEnd = shiftDays(week, 6);
  const thisWeek = mondayOf(board.today);
  const weekRows = useMemo(
    () => board.entries.filter((e) => e.workDate >= week && e.workDate <= weekEnd),
    [board.entries, week, weekEnd],
  );
  const rows = weekRows.filter(
    (e) => (!team || e.team === team) && (!typeFilter || e.workType === typeFilter),
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/team-weekly", { cache: "no-store" });
    if (response.ok) setBoard(await response.json());
  }, []);

  const call: CallFn = useCallback(
    async (key, path, init, success, optimistic) => {
      const send = () =>
        fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
      setBanner(null);
      setArmed(null);

      /* Shown at once, saved behind (Monica, 9 Oct: "itna wait kyun, ekdum
         kyun nahi"). The database is a long round trip away; the screen does
         not wait for it. If the save fails, the board is read again so the
         screen goes back to the truth, and the error says what was lost. */
      if (optimistic) {
        setBoard(optimistic);
        if (success) setBanner({ tone: "success", message: success });
        void send()
          .then(async (response) => {
            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              setBanner({
                tone: "error",
                message: `Not saved — ${data.error ?? `request failed (${response.status})`}`,
              });
            }
          })
          .catch(() => setBanner({ tone: "error", message: "Not saved — the connection dropped. Try again." }))
          .finally(() => void refresh());
        return true;
      }

      setBusy(key);
      try {
        const response = await send();
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBanner({ tone: "error", message: data.error ?? `Request failed (${response.status})` });
          return false;
        }
        await refresh();
        if (success) setBanner({ tone: "success", message: success });
        return true;
      } finally {
        setBusy(null);
      }
    },
    [refresh],
  );

  /** Two clicks to remove: the first arms the button, the second removes. */
  const arm = (key: string, action: () => void) => {
    if (armed === key) {
      action();
      return;
    }
    setArmed(key);
    window.setTimeout(() => setArmed((k) => (k === key ? null : k)), 3500);
  };

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "work", label: "Work list", badge: weekRows.length },
    { key: "performance", label: "Performance" },
  ];

  return (
    <div id="print-area">
      {/* On paper there is no header and no tab strip, so the sheet says
          which board, which week and which team itself. */}
      <div className="hidden" data-print="only">
        <h1 className="font-body text-base font-bold">
          Team Weekly Board · {tab === "work" ? "Work list" : "Performance"}
        </h1>
        <p className="font-body text-xs">
          Week {short(week)} – {short(weekEnd)} · {team ?? "all teams"}
          {typeFilter ? ` · ${typeFilter}` : ""}
        </p>
      </div>
      {banner ? (
        <div
          role="alert"
          data-print="hide"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 font-bold text-alert"
              : "border-forest bg-forest/5 font-light text-forest"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-line" data-print="hide">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 font-body text-sm transition-colors ${
              tab === t.key
                ? "border-amber-deep font-bold text-white"
                : "border-transparent font-light text-secondary hover:text-ink"
            }`}
          >
            {t.label}
            {t.badge !== undefined ? <span className="ml-2 font-light text-muted">{t.badge}</span> : null}
          </button>
        ))}

        {/* The 3D page — Team Neeru and Team Dhruv. A page, not a tab: it has
            its own teams and its own stages. */}
        <Link
          href="/team-board/3d"
          className="mx-2 rounded border border-amber-deep px-4 py-1 font-body text-sm font-bold tracking-[0.08em] text-amber-deep transition-colors hover:bg-amber-deep hover:text-canvas"
        >
          3D
        </Link>

        <span className="ml-auto flex items-center gap-2 py-2.5 font-body text-xs font-light text-muted">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeek(shiftDays(week, -7))}
            className="h-7 w-7 rounded border border-line-strong bg-canvas text-secondary transition-colors hover:bg-hover hover:text-ink"
          >
            ‹
          </button>
          Week{" "}
          <span className="font-bold text-secondary">
            {short(week)} – {short(weekEnd)}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeek(shiftDays(week, 7))}
            className="h-7 w-7 rounded border border-line-strong bg-canvas text-secondary transition-colors hover:bg-hover hover:text-ink"
          >
            ›
          </button>
          {week !== thisWeek ? (
            <button
              type="button"
              onClick={() => setWeek(thisWeek)}
              className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
            >
              this week
            </button>
          ) : (
            <span>· this week</span>
          )}
        </span>

        <span className="ml-4 py-1.5">
          <SaveBar
            saving={busy !== null}
            onFile={() =>
              downloadSheet(
                `team-weekly-${week}${team ? `-${team.replace(/\s+/g, "-").toLowerCase()}` : ""}.csv`,
                rows.map((r) => ({
                  Team: r.team,
                  Type: r.workType,
                  "What was done": r.title,
                  Qty: r.qty,
                  Date: r.workDate,
                  Status: STATUS_LABEL[r.status],
                })),
                ["Team", "Type", "What was done", "Qty", "Date", "Status"],
              )
            }
          />
        </span>
      </div>

      {/* The team lens, above both tabs — the list and Performance narrow together. */}
      <div className="mb-5 flex flex-wrap items-center gap-2" data-print="hide">
        <span className={label}>Team</span>
        <TeamChip label="All" count={weekRows.length} active={team === null} onClick={() => setTeam(null)} />
        {board.teams.map((t) => (
          <TeamChip
            key={t}
            label={t}
            count={weekRows.filter((r) => r.team === t).length}
            active={team === t}
            onClick={() => setTeam(t)}
          />
        ))}
      </div>

      {tab === "work" ? (
        <WorkList
          board={board}
          rows={rows}
          team={team}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          adding={adding}
          setAdding={setAdding}
          busy={busy}
          armed={armed}
          arm={arm}
          call={call}
          week={week}
          setWeek={setWeek}
        />
      ) : (
        <Performance board={board} rows={weekRows} team={team} />
      )}
    </div>
  );
}

function TeamChip({
  label: text,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
        active ? "border-line-strong bg-selected text-white" : "border-line bg-card text-secondary hover:bg-hover"
      }`}
    >
      {text}
      <span className="ml-2 font-light text-muted">{count === 0 ? "—" : count}</span>
    </button>
  );
}

/** `optimistic` puts the change on screen at once and saves it behind. */
type CallFn = (
  key: string,
  path: string,
  init: RequestInit,
  success?: string,
  optimistic?: (board: Board) => Board,
) => Promise<boolean>;

/** An entry added on screen but not yet back from the database. */
const isPending = (id: string) => id.startsWith("new-");

function WorkList({
  board,
  rows,
  team,
  typeFilter,
  setTypeFilter,
  adding,
  setAdding,
  busy,
  armed,
  arm,
  call,
  week,
  setWeek,
}: {
  board: Board;
  rows: WeeklyEntry[];
  team: string | null;
  typeFilter: string;
  setTypeFilter: (v: string) => void;
  adding: boolean;
  setAdding: (v: boolean) => void;
  busy: string | null;
  armed: string | null;
  arm: (key: string, action: () => void) => void;
  call: CallFn;
  week: string;
  setWeek: (v: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const total = qty(rows);
  const done = qty(rows.filter((r) => r.status === "done"));
  const groups = board.teams
    .map((t) => [t, rows.filter((r) => r.team === t)] as const)
    .filter(([, items]) => items.length > 0);

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Entries this week" value={String(rows.length)} />
        <MetricCard label="Items" value={String(total)} sub="quantity added up" />
        <MetricCard label="Done" value={String(done)} sub={total ? `${pct(done, total)} of items` : undefined} />
        <MetricCard label="Still open" value={String(total - done)} sub="in progress or delayed" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2" data-print="hide">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAdding(!adding)}
            className="rounded bg-ink px-3 py-1.5 font-body text-xs font-bold text-canvas transition-opacity hover:opacity-90"
          >
            {adding ? "Close" : "+ Add work"}
          </button>
          <select
            aria-label="Filter by work type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={input.replace("w-full", "w-auto")}
          >
            <option value="">All work types</option>
            {board.workTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {rows.length > 0 ? (
          <button
            type="button"
            disabled={busy === "clear"}
            onClick={() =>
              arm("clear", () =>
                void call(
                  "clear",
                  "/api/team-weekly/remove",
                  {
                    method: "POST",
                    body: JSON.stringify({ ids: rows.filter((r) => !isPending(r.id)).map((r) => r.id) }),
                  },
                  `${rows.length} ${rows.length === 1 ? "entry" : "entries"} removed${team ? ` from ${team}` : ""}.`,
                  (b) => {
                    const gone = new Set(rows.map((r) => r.id));
                    return { ...b, entries: b.entries.filter((x) => !gone.has(x.id)) };
                  },
                ),
              )
            }
            className={`rounded border px-3 py-1.5 font-body text-xs transition-colors disabled:opacity-50 ${
              armed === "clear"
                ? "border-alert bg-alert font-bold text-cream"
                : "border-line-strong bg-canvas font-light text-muted hover:border-alert hover:text-alert"
            }`}
          >
            {armed === "clear" ? `Remove ${rows.length}? Click again` : "Remove this week"}
          </button>
        ) : null}
      </div>

      {adding ? (
        <AddWorkForm
          board={board}
          team={team}
          busy={busy === "create"}
          call={call}
          onAdded={(day) => {
            if (day < week || day > shiftDays(week, 6)) setWeek(mondayOf(day));
          }}
        />
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center">
          <p className="font-body text-sm font-light text-secondary">
            <span className="font-bold text-ink">{team ?? "This week"}</span> has nothing on the board yet.
            Press “+ Add work”, pick the team and the work type, and say what was done.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left font-body text-[13.5px]">
            <thead>
              <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
                <th className="px-3 py-2.5 font-bold">Type</th>
                <th className="px-3 py-2.5 font-bold">What was done</th>
                <th className="px-3 py-2.5 text-right font-bold">Qty</th>
                <th className="px-3 py-2.5 font-bold">Date</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-3 py-2.5 font-bold" data-print="hide" />
              </tr>
            </thead>
            {groups.map(([t, items]) => (
              <tbody key={t}>
                <tr className="border-t border-line bg-surface">
                  <td colSpan={6} className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-secondary">
                    {t}
                    <span className="ml-2 font-light normal-case tracking-normal text-muted">
                      {items.length} {items.length === 1 ? "entry" : "entries"} · {qty(items)}{" "}
                      {qty(items) === 1 ? "item" : "items"}
                    </span>
                  </td>
                </tr>
                {items.map((e) =>
                  editingId === e.id ? (
                    <EditRow
                      key={e.id}
                      entry={e}
                      board={board}
                      onCancel={() => setEditingId(null)}
                      onSave={(patch) => {
                        setEditingId(null);
                        void call(
                          e.id,
                          `/api/team-weekly/${e.id}`,
                          { method: "PATCH", body: JSON.stringify(patch) },
                          "Saved.",
                          (b) => ({
                            ...b,
                            entries: b.entries.map((x) => (x.id === e.id ? { ...x, ...patch } : x)),
                          }),
                        );
                        if (patch.workDate && (patch.workDate < week || patch.workDate > shiftDays(week, 6))) {
                          setWeek(mondayOf(patch.workDate));
                        }
                      }}
                    />
                  ) : (
                  <tr key={e.id} className="border-t border-line bg-card align-top transition-colors hover:bg-hover">
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">{e.workType}</td>
                    <td className="min-w-[220px] px-3 py-2.5 font-light text-ink">{e.title}</td>
                    <td className="px-3 py-2.5 text-right font-light tabular-nums text-ink">{e.qty}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-light text-secondary">{short(e.workDate)}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block whitespace-nowrap rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${STATUS_CLASS[e.status]}`}
                      >
                        {STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5" data-print="hide">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {isPending(e.id) ? (
                        <span className="font-body text-xs font-light text-muted">Saving…</span>
                      ) : (
                        <>
                      {MOVES[e.status].map((to) => (
                        <button
                          key={to}
                          type="button"
                          disabled={busy === e.id}
                          onClick={() =>
                            void call(
                              e.id,
                              `/api/team-weekly/${e.id}`,
                              { method: "PATCH", body: JSON.stringify({ status: to }) },
                              `Marked ${STATUS_LABEL[to]}.`,
                              (b) => ({
                                ...b,
                                entries: b.entries.map((x) => (x.id === e.id ? { ...x, status: to } : x)),
                              }),
                            )
                          }
                          className={`whitespace-nowrap rounded border bg-canvas px-3 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${MOVE_CLASS[to]}`}
                        >
                          {to === "done" ? "✓ Done" : "In progress"}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={busy === e.id}
                        onClick={() => setEditingId(e.id)}
                        className="rounded border border-line-strong bg-canvas px-3 py-1 text-xs font-bold text-secondary transition-colors hover:bg-hover hover:text-ink disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy === e.id}
                        onClick={() =>
                          arm(e.id, () =>
                            void call(
                              e.id,
                              `/api/team-weekly/${e.id}`,
                              { method: "DELETE" },
                              `Removed from ${e.team}.`,
                              (b) => ({ ...b, entries: b.entries.filter((x) => x.id !== e.id) }),
                            ),
                          )
                        }
                        className={`rounded border px-3 py-1 text-xs transition-colors disabled:opacity-50 ${
                          armed === e.id
                            ? "border-alert bg-alert font-bold text-cream"
                            : "border-line-strong bg-canvas font-light text-muted hover:border-alert hover:text-alert"
                        }`}
                      >
                        {armed === e.id ? "Sure?" : "Remove"}
                      </button>
                        </>
                      )}
                      </div>
                    </td>
                  </tr>
                  ),
                )}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}

type EntryPatch = Partial<Pick<WeeklyEntry, "team" | "workType" | "title" | "qty" | "workDate" | "status">>;

/**
 * One entry, opened for editing in its own row (Monica, 9 Oct: "edit pe
 * click karke ho jaye"). Every detail can change — team, type, what was
 * done, how many, the day, the status. Only what changed is sent.
 */
function EditRow({
  entry,
  board,
  onCancel,
  onSave,
}: {
  entry: WeeklyEntry;
  board: Board;
  onCancel: () => void;
  onSave: (patch: EntryPatch) => void;
}) {
  const [teamName, setTeamName] = useState(entry.team);
  const [workType, setWorkType] = useState(entry.workType);
  const [title, setTitle] = useState(entry.title);
  const [count, setCount] = useState(String(entry.qty));
  const [workDate, setWorkDate] = useState(entry.workDate);
  const [status, setStatus] = useState<WeeklyStatus>(entry.status);

  return (
    <tr className="border-t border-amber-deep/60 bg-selected align-top">
      <td colSpan={6} className="px-3 py-3">
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            const next: Required<EntryPatch> = {
              team: teamName,
              workType,
              title: title.trim(),
              qty: Math.max(1, parseInt(count, 10) || 1),
              workDate,
              status,
            };
            const patch: EntryPatch = {};
            for (const k of Object.keys(next) as (keyof EntryPatch)[]) {
              if (next[k] !== entry[k]) (patch as Record<string, unknown>)[k] = next[k];
            }
            if (Object.keys(patch).length === 0) onCancel();
            else onSave(patch);
          }}
          className="grid gap-3 md:grid-cols-6"
        >
          <label className="block md:col-span-1">
            <span className={`mb-1 block ${label}`}>Team</span>
            <select value={teamName} onChange={(ev) => setTeamName(ev.target.value)} className={input}>
              {board.teams.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-1">
            <span className={`mb-1 block ${label}`}>Type</span>
            <select value={workType} onChange={(ev) => setWorkType(ev.target.value)} className={input}>
              {board.workTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="block md:col-span-4">
            <span className={`mb-1 block ${label}`}>What was done</span>
            <input required value={title} onChange={(ev) => setTitle(ev.target.value)} className={input} autoFocus />
          </label>
          <label className="block md:col-span-1">
            <span className={`mb-1 block ${label}`}>Qty</span>
            <input type="number" min={1} max={999} value={count} onChange={(ev) => setCount(ev.target.value)} className={input} />
          </label>
          <label className="block md:col-span-2">
            <span className={`mb-1 block ${label}`}>Date</span>
            <input type="date" required value={workDate} onChange={(ev) => setWorkDate(ev.target.value)} className={input} />
          </label>
          <label className="block md:col-span-1">
            <span className={`mb-1 block ${label}`}>Status</span>
            <select value={status} onChange={(ev) => setStatus(ev.target.value as WeeklyStatus)} className={input}>
              <option value="pending">Delay</option>
              <option value="progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </label>
          <div className="flex items-end gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={!title.trim()}
              className="rounded bg-ink px-4 py-1.5 font-body text-xs font-bold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-light text-muted hover:bg-hover hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function AddWorkForm({
  board,
  team,
  busy,
  call,
  onAdded,
}: {
  board: Board;
  team: string | null;
  busy: boolean;
  call: CallFn;
  onAdded: (day: string) => void;
}) {
  const [teamName, setTeamName] = useState(team ?? board.teams[0] ?? "");
  const [workType, setWorkType] = useState(board.workTypes[0] ?? "");
  const [title, setTitle] = useState("");
  const [count, setCount] = useState("1");
  const [workDate, setWorkDate] = useState(board.today);
  const [status, setStatus] = useState<WeeklyStatus>("done");

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const entry: WeeklyEntry = {
          id: `new-${Date.now()}`,
          team: teamName,
          particular: "",
          workType,
          title: title.trim(),
          qty: Math.max(1, parseInt(count, 10) || 1),
          workDate,
          status,
          createdAt: new Date().toISOString(),
        };
        const ok = await call(
          "create",
          "/api/team-weekly",
          {
            method: "POST",
            body: JSON.stringify({
              team: entry.team,
              workType: entry.workType,
              title: entry.title,
              qty: entry.qty,
              workDate: entry.workDate,
              status: entry.status,
            }),
          },
          `${workType} added to ${teamName}.`,
          // On the list at once, marked "Saving…" until the database answers.
          (b) => ({ ...b, entries: [entry, ...b.entries] }),
        );
        if (ok) {
          setTitle("");
          setCount("1");
          onAdded(workDate);
        }
      }}
      className="mb-6 rounded-lg border border-line bg-card px-5 py-4"
      data-print="hide"
    >
      <h3 className="mb-3 font-heading text-lg text-white">Add work to the board</h3>
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <label className="block">
          <span className={`mb-1 block ${label}`}>Team *</span>
          <select required value={teamName} onChange={(e) => setTeamName(e.target.value)} className={input}>
            {board.teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <OptionPicker
          title="Work type *"
          kind="work_type"
          options={board.workTypes}
          value={workType}
          onChange={setWorkType}
          call={call}
          placeholder="e.g. Elevations"
        />
        <label className="block">
          <span className={`mb-1 block ${label}`}>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as WeeklyStatus)} className={input}>
            <option value="done">Done</option>
            <option value="progress">In progress</option>
            <option value="pending">Delay</option>
          </select>
        </label>
        <label className="block md:col-span-3 lg:col-span-4">
          <span className={`mb-1 block ${label}`}>What was done *</span>
          <textarea
            required
            rows={2}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. 2nd floor living room layout, revision 2"
            className={input}
          />
        </label>
        <label className="block">
          <span className={`mb-1 block ${label}`}>Quantity</span>
          <input type="number" min={1} max={999} value={count} onChange={(e) => setCount(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className={`mb-1 block ${label}`}>Date *</span>
          <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} className={input} />
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || !title.trim()}
          className="rounded bg-ink px-4 py-1.5 font-body text-xs font-bold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add to board"}
        </button>
      </div>
    </form>
  );
}

/** Chips for RK / MR / JKR (or Layouts / Intents / SLD), plus "+ New" to add one to the list. */
function OptionPicker({
  title,
  kind,
  options,
  value,
  onChange,
  call,
  placeholder,
}: {
  title: string;
  kind: "work_type";
  options: string[];
  value: string;
  onChange: (v: string) => void;
  call: CallFn;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <div>
      <span className={`mb-1 block ${label}`}>{title}</span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`rounded border px-2.5 py-1 font-body text-xs font-bold transition-colors ${
              value === o ? "border-amber-deep bg-selected text-white" : "border-line bg-canvas text-secondary hover:bg-hover"
            }`}
          >
            {o}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="rounded border border-dashed border-line-strong px-2.5 py-1 font-body text-xs font-light text-muted hover:text-ink"
        >
          + New
        </button>
      </div>
      {open ? (
        <div className="mt-2 flex gap-1.5">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} className={input} />
          <button
            type="button"
            disabled={!name.trim()}
            onClick={async () => {
              const clean = name.trim();
              const ok = await call(`opt-${kind}`, "/api/team-weekly/options", {
                method: "POST",
                body: JSON.stringify({ kind, name: clean }),
              }, `"${clean}" added to the list.`);
              if (ok) {
                onChange(clean);
                setName("");
                setOpen(false);
              }
            }}
            className="rounded border border-line-strong bg-canvas px-3 font-body text-xs font-bold text-secondary hover:bg-hover hover:text-ink disabled:opacity-50"
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Performance({ board, rows, team }: { board: Board; rows: WeeklyEntry[]; team: string | null }) {
  const shown = team ? [team] : board.teams;
  const scoped = rows.filter((r) => shown.includes(r.team));
  const total = qty(scoped);
  const done = qty(scoped.filter((r) => r.status === "done"));

  const stats = shown.map((t) => {
    const mine = rows.filter((r) => r.team === t);
    return {
      team: t,
      total: qty(mine),
      done: qty(mine.filter((r) => r.status === "done")),
      types: board.workTypes.map((w) => [w, qty(mine.filter((r) => r.workType === w))] as const),
    };
  });
  const max = Math.max(1, ...stats.flatMap((s) => s.types.map(([, n]) => n)));
  const ranked = [...stats].sort((a, b) => b.total - a.total || b.done - a.done);

  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Items this week" value={String(total)} />
        <MetricCard label="Done" value={String(done)} sub={total ? `${pct(done, total)} of items` : undefined} />
        {board.workTypes.slice(0, 2).map((w) => (
          <MetricCard key={w} label={w} value={String(qty(scoped.filter((r) => r.workType === w)))} />
        ))}
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {stats.map((s) => (
          <div key={s.team} className="rounded-lg border border-line bg-card px-5 py-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-body text-base font-bold text-ink">{s.team}</p>
              <p className="font-body text-2xl font-light tabular-nums text-white">{s.total}</p>
            </div>
            <p className="font-body text-xs font-light text-muted">
              {s.total ? `${s.done} of ${s.total} done · ${pct(s.done, s.total)}` : "Nothing added this week"}
            </p>
            <div className="mt-4 grid gap-2">
              {s.types.map(([w, n]) => (
                <div key={w} className="grid grid-cols-[9ch_minmax(0,1fr)_3ch] items-center gap-2.5 font-body text-xs font-light text-secondary">
                  <span>{w}</span>
                  <div className="h-2 overflow-hidden rounded border border-line bg-surface">
                    <div className="h-full bg-amber-deep" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="text-right tabular-nums text-ink">{n}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-3 font-heading text-lg text-white">Week ranking</h3>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left font-body text-[13.5px]">
          <thead>
            <tr className="bg-surface text-[11px] uppercase tracking-[0.12em] text-secondary">
              <th className="px-3 py-2.5 font-bold">#</th>
              <th className="px-3 py-2.5 font-bold">Team</th>
              {board.workTypes.map((w) => (
                <th key={w} className="px-3 py-2.5 text-right font-bold">
                  {w}
                </th>
              ))}
              <th className="px-3 py-2.5 text-right font-bold">Total</th>
              <th className="px-3 py-2.5 text-right font-bold">Done</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((s, i) => (
              <tr key={s.team} className="border-t border-line bg-card">
                <td className="px-3 py-2.5 font-light tabular-nums text-muted">{i + 1}</td>
                <td className="whitespace-nowrap px-3 py-2.5 font-bold text-ink">{s.team}</td>
                {s.types.map(([w, n]) => (
                  <td key={w} className="px-3 py-2.5 text-right font-light tabular-nums text-ink">
                    {n || "—"}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-right font-bold tabular-nums text-ink">{s.total}</td>
                <td className="px-3 py-2.5 text-right font-light tabular-nums text-secondary">{pct(s.done, s.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
