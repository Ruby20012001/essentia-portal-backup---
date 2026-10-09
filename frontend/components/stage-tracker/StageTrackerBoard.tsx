"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SaveBar } from "@/components/team-weekly/SaveBar";
import type { Discipline, StageBoard, StageField, StageRow } from "@/lib/services/stage-tracker";

/**
 * The Stage Tracker — ID first, with 3D and Architecture as two buttons beside
 * its title. One table per tab; every cell is typed into where it sits (click,
 * type, Enter), because the data is updated every day and a form per change
 * would be the slow way.
 *
 * Values are free text on purpose — the office writes "sent: 17th july
 * approved: 20th", not a date. Rows changed today (India time) are marked, and
 * "Aaj ke updates" shows only those.
 */

type Column = { field: StageField; label: string; wide?: boolean };
type Group = { label: string | null; columns: Column[] };

const TABS: { key: Discipline; button: string; title: string }[] = [
  { key: "id", button: "ID", title: "ID Tracker" },
  { key: "3d", button: "3D", title: "3D Tracker" },
  { key: "arch", button: "Architecture", title: "Architecture Tracker" },
];

const GROUPS: Record<Discipline, Group[]> = {
  id: [
    // Status beside the name, not at the far end (Monica, 8 Oct).
    {
      label: null,
      columns: [
        { field: "member", label: "Team member" },
        { field: "status", label: "Status", wide: true },
      ],
    },
    {
      label: "Layout",
      columns: [
        { field: "layoutStart", label: "Start" },
        { field: "layoutEnd", label: "End" },
        { field: "layoutSignoff", label: "Signoff" },
      ],
    },
    {
      label: "Vibe",
      columns: [
        { field: "vibeStart", label: "Start" },
        { field: "vibeEnd", label: "End" },
        { field: "vibeSignoff", label: "Signoff" },
      ],
    },
    {
      label: "Camera angles",
      columns: [
        { field: "camStart", label: "Start" },
        { field: "camEnd", label: "End" },
        { field: "camSignoff", label: "Signoff" },
      ],
    },
  ],
  "3d": [
    {
      label: null,
      columns: [
        { field: "member", label: "Team member" },
        { field: "status", label: "Status", wide: true },
        { field: "startDate", label: "Start date" },
        { field: "endDate", label: "End date" },
      ],
    },
  ],
  arch: [
    {
      label: null,
      columns: [
        { field: "member", label: "Team member" },
        { field: "status", label: "Status", wide: true },
        { field: "techDrawings", label: "Technical drawings", wide: true },
        { field: "boundbook", label: "Boundbook date" },
        { field: "extGfc", label: "Ext. GFCs", wide: true },
      ],
    },
  ],
};

const input =
  "w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none";
const smallBtn =
  "rounded border border-line-strong bg-canvas px-2.5 py-1 font-body text-xs font-light text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40";
const th = "border-b border-line px-3 py-2 text-left font-body text-[11px] font-light uppercase tracking-[0.12em] text-muted";

/**
 * Where to slide the table to, one view along, landing on a column's edge so
 * no column is left half under the sticky Project column. Right: the column
 * cut off at the right edge becomes the first one shown. Left: the reverse.
 */
function nextStop(box: HTMLElement, dir: 1 | -1): number {
  const cells = [...(box.querySelector("tbody tr")?.children ?? [])] as HTMLElement[];
  if (cells.length < 2) return box.scrollLeft + dir * box.clientWidth;
  const sticky = cells[0].offsetWidth;
  const view = box.clientWidth - sticky;
  const max = box.scrollWidth - box.clientWidth;
  const stops = cells.slice(1).map((c) => c.offsetLeft - sticky).filter((s) => s >= 0);
  const at = box.scrollLeft;
  let to: number;
  if (dir === 1) {
    const ahead = stops.filter((s) => s > at + 1);
    const seen = ahead.filter((s) => s <= at + view - 40);
    to = seen.length ? Math.max(...seen) : ahead.length ? Math.min(...ahead) : max;
  } else {
    const behind = stops.filter((s) => s < at - 1);
    const fits = behind.filter((s) => s >= at - view);
    to = fits.length ? Math.min(...fits) : behind.length ? Math.max(...behind) : 0;
  }
  return Math.max(0, Math.min(max, to));
}

function indiaDate(s: string): string {
  return new Date(s).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function StageTrackerBoard({
  initial,
  initialTab,
  readOnly = false,
}: {
  initial: StageBoard;
  initialTab: Discipline;
  /** Nobody signed in: the board to read, no pen. */
  readOnly?: boolean;
}) {
  const [board, setBoard] = useState(initial);
  const [tab, setTab] = useState<Discipline>(initialTab);
  const [search, setSearch] = useState("");
  const [member, setMember] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/stage-board", { cache: "no-store" });
    if (response.ok) setBoard(await response.json());
  }, []);

  /* The spreadsheet's changes arrive by themselves (db/run-stage-sync.cmd),
     so an open board reads again every minute while it is on screen. A cell
     being typed into keeps its own draft; only the rows underneath refresh. */
  const [checkedAt, setCheckedAt] = useState(() => new Date());
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void refresh().then(() => setCheckedAt(new Date()));
    };
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh]);

  /* Auto scroll (Monica, 8 Oct: "automatically slide kar de, bahut neeche
     jaana padta hai"). The page scrolls inside <main>; this walks it down at
     an easy reading pace, holds at the bottom, and starts again from the top.
     A wheel, a touch or a key press hands the page back to the person. */
  const [autoScroll, setAutoScroll] = useState(false);
  /* The table is wider than a laptop screen on ID. Sideways is one view at a
     time, less the sticky Project column, so a column is never skipped. */
  const tableBox = useRef<HTMLDivElement>(null);
  const slide = useCallback((dir: 1 | -1) => {
    const t = tableBox.current;
    if (!t) return;
    t.scrollTo({ left: nextStop(t, dir), behavior: "smooth" });
  }, []);
  useEffect(() => {
    if (!autoScroll) return;
    // Whichever actually scrolls: <main> when the page is a fixed frame, else the window.
    const main = document.querySelector("main");
    const box =
      main && main.scrollHeight > main.clientHeight + 2
        ? main
        : (document.scrollingElement as HTMLElement | null);
    if (!box) return;
    const PX_PER_SEC = 40;
    const HOLD_MS = 3000;
    let raf = 0;
    let back = 0;
    let last = performance.now();
    let holdUntil = performance.now() + 1000;
    let pos = box.scrollTop;
    const step = (now: number) => {
      const dt = now - last;
      last = now;
      if (now >= holdUntil) {
        if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) {
          // Hold on the last rows, jump to the top, hold on the first rows.
          holdUntil = now + HOLD_MS * 2;
          back = window.setTimeout(() => {
            // Then the next columns to the right — or, after the last, the first.
            const t = tableBox.current;
            if (t && t.scrollWidth > t.clientWidth + 2) {
              t.scrollLeft = t.scrollLeft + t.clientWidth >= t.scrollWidth - 2 ? 0 : nextStop(t, 1);
            }
            box.scrollTop = 0;
            pos = 0;
          }, HOLD_MS);
        } else {
          pos += (PX_PER_SEC * dt) / 1000;
          box.scrollTop = pos;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const stop = () => setAutoScroll(false);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(back);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [autoScroll]);

  const call = useCallback(
    async (key: string, path: string, init: RequestInit, success?: string) => {
      setBusy(key);
      setBanner(null);
      try {
        const response = await fetch(path, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
        });
        const data = await response.json().catch(() => ({}));
        await refresh();
        if (!response.ok) {
          setBanner({ tone: "error", message: data.error ?? `Request failed (${response.status})` });
          return false;
        }
        if (success) setBanner({ tone: "success", message: success });
        return true;
      } finally {
        setBusy(null);
        setArmed(null);
      }
    },
    [refresh],
  );

  /** Show the new value at once, then save. */
  const save = useCallback(
    (row: StageRow, field: StageField | "project", value: string) => {
      const clean = value.replace(/\s+/g, " ").trim();
      const before = (row as Record<string, unknown>)[field] ?? "";
      if (clean === before) return;
      setBoard((b) => ({
        ...b,
        rows: b.rows.map((r) => (r.id === row.id ? { ...r, [field]: clean || null, updatedToday: true } : r)),
      }));
      void call(row.id, `/api/stage-board/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ [field]: clean || null }),
      });
    },
    [call],
  );

  const chooseTab = (t: Discipline) => {
    setTab(t);
    setMember("");
    setAdding(false);
    const url = new URL(window.location.href);
    if (t === "id") url.searchParams.delete("tab");
    else url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };

  const arm = (key: string, action: () => void) => {
    if (armed === key) {
      action();
      return;
    }
    setArmed(key);
    window.setTimeout(() => setArmed((k) => (k === key ? null : k)), 3500);
  };

  const onTab = useMemo(() => board.rows.filter((r) => r.discipline === tab), [board.rows, tab]);
  const members = useMemo(
    () => [...new Set(onTab.map((r) => r.member).filter((m): m is string => !!m))].sort((a, b) => a.localeCompare(b)),
    [onTab],
  );
  const q = search.trim().toLowerCase();
  const shown = onTab.filter(
    (r) =>
      (!todayOnly || r.updatedToday) &&
      (!member || r.member === member) &&
      (!q || Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(q))),
  );
  const todayCount = onTab.filter((r) => r.updatedToday).length;
  const groups = GROUPS[tab];
  const columns = groups.flatMap((g) => g.columns);
  const grouped = groups.some((g) => g.label);
  const current = TABS.find((t) => t.key === tab)!;

  return (
    <div id="print-area">
      <div className="hidden" data-print="only">
        <h1 className="font-body text-base font-bold">{current.title}</h1>
        <p className="font-body text-xs">
          {shown.length} projects{todayOnly ? " · updated today" : ""}
          {member ? ` · ${member}` : ""}
        </p>
      </div>

      {/* The title, with the two other trackers as buttons beside it. */}
      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3" data-print="hide">
        <h1 className="font-heading text-2xl text-white">{current.title}</h1>
        <div role="tablist" aria-label="Tracker" className="flex rounded-lg border border-line-strong p-1">
          {TABS.map((t) => {
            const n = board.rows.filter((r) => r.discipline === t.key).length;
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => chooseTab(t.key)}
                className={`rounded-md px-4 py-1.5 font-body text-xs font-bold uppercase tracking-[0.12em] transition-colors ${
                  active ? "bg-amber-deep text-cream" : "text-muted hover:bg-hover hover:text-ink"
                }`}
              >
                {t.button}
                <span className={`ml-2 font-light tabular-nums ${active ? "text-cream/80" : "text-muted"}`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {banner ? (
        <div
          role="status"
          data-print="hide"
          className={`mb-5 flex items-center justify-between gap-3 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 font-bold text-alert"
              : "border-forest bg-forest/5 font-light text-forest"
          }`}
        >
          {banner.message}
          <button type="button" onClick={() => setBanner(null)} aria-label="Dismiss" className="text-muted hover:text-ink">
            ×
          </button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-print="hide">
        <div className="flex flex-wrap items-center gap-2">
          {readOnly ? null : (
            <button type="button" onClick={() => setAdding(!adding)} className={smallBtn}>
              {adding ? "Close" : "+ Add project"}
            </button>
          )}
          <button
            type="button"
            aria-pressed={todayOnly}
            onClick={() => setTodayOnly(!todayOnly)}
            className={`rounded border px-2.5 py-1 font-body text-xs transition-colors ${
              todayOnly
                ? "border-amber-deep bg-amber-deep font-bold text-cream"
                : "border-line-strong bg-canvas font-light text-muted hover:text-ink"
            }`}
          >
            Aaj ke updates <span className="font-bold tabular-nums">{todayCount}</span>
          </button>
          <button
            type="button"
            aria-pressed={autoScroll}
            onClick={() => setAutoScroll(!autoScroll)}
            title="List apne aap neeche chalegi — mouse wheel ya koi key dabate hi ruk jaayegi"
            className={`rounded border px-2.5 py-1 font-body text-xs transition-colors ${
              autoScroll
                ? "border-forest bg-forest font-bold text-cream"
                : "border-line-strong bg-canvas font-light text-muted hover:text-ink"
            }`}
          >
            {autoScroll ? "⏸ Auto scroll rokiye" : "▶ Auto scroll"}
          </button>
          <select
            value={member}
            onChange={(e) => setMember(e.target.value)}
            aria-label="Team member"
            className={input.replace("w-full", "w-auto")}
          >
            <option value="">Every team member</option>
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search"
            className={`${input} w-full sm:w-56`}
          />
        </div>
        <SaveBar saving={busy !== null} />
      </div>

      {adding ? (
        <AddForm
          busy={busy === "new"}
          tabTitle={current.title}
          onCancel={() => setAdding(false)}
          onSubmit={async (project, who) => {
            const ok = await call(
              "new",
              "/api/stage-board",
              { method: "POST", body: JSON.stringify({ discipline: tab, project, member: who || null }) },
              `${project} added to the ${current.title}.`,
            );
            if (ok) setAdding(false);
          }}
        />
      ) : null}

      <p className="mb-2 font-body text-xs font-light text-muted" data-print="hide">
        {readOnly
          ? "Sirf dekhne ke liye — badalne ke liye upar “Sign in to edit”. "
          : "Kisi bhi cell par click karke likhiye — Enter dabate hi save. "}
        Aaj badli rows par{" "}
        <span className="font-bold text-amber-deep">Today</span> laga hota hai. MASTER TRACKER ke badlaav khud
        aate hain — board har minute dobara padhta hai (last{" "}
        <span suppressHydrationWarning>
          {checkedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}
        </span>{" "}
        IST).
      </p>

      <div className="mb-2 flex justify-end gap-1.5" data-print="hide">
        <button type="button" onClick={() => slide(-1)} className={smallBtn} aria-label="Pichhle columns">
          ◀ Left
        </button>
        <button type="button" onClick={() => slide(1)} className={smallBtn} aria-label="Agle columns">
          Right ▶
        </button>
      </div>
      <div ref={tableBox} className="overflow-x-auto rounded-lg border border-line bg-card">
        {/* Separate borders, not collapsed: a sticky cell in a collapsed table
            does not paint its own background, and the columns slid under the
            Project column showed through it. */}
        <table className="w-full min-w-[720px] border-separate border-spacing-0">
          <thead>
            {grouped ? (
              <tr>
                <th className={`${th} sticky left-0 z-10 bg-card`} rowSpan={2}>
                  Project
                </th>
                {groups.map((g, i) =>
                  g.label ? (
                    <th
                      key={i}
                      colSpan={g.columns.length}
                      className="border-b border-l border-line px-3 py-2 text-center font-body text-xs font-bold uppercase tracking-[0.12em] text-amber-deep"
                    >
                      {g.label}
                    </th>
                  ) : (
                    g.columns.map((c) => (
                      <th key={c.field} rowSpan={2} className={`${th} border-l`}>
                        {c.label}
                      </th>
                    ))
                  ),
                )}
                <th rowSpan={2} className={th} data-print="hide" />
              </tr>
            ) : null}
            <tr>
              {grouped ? null : <th className={`${th} sticky left-0 z-10 bg-card`}>Project</th>}
              {groups.flatMap((g) =>
                grouped && !g.label
                  ? []
                  : g.columns.map((c, i) => (
                      <th key={c.field} className={`${th} ${i === 0 || !grouped ? "border-l" : ""}`}>
                        {c.label}
                      </th>
                    )),
              )}
              {grouped ? null : <th className={th} data-print="hide" />}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center font-body text-sm font-light text-muted">
                  {onTab.length === 0
                    ? `${current.title} par abhi koi project nahi hai. “+ Add project” se shuru kijiye.`
                    : todayOnly
                      ? "Aaj is tab par kuch update nahi hua."
                      : "Kuch match nahi hua."}
                </td>
              </tr>
            ) : null}
            {shown.map((r) => (
              <tr
                key={r.id}
                className={`align-top [&>td]:border-b [&>td]:border-line last:[&>td]:border-b-0 ${busy === r.id ? "opacity-60" : ""}`}
              >
                <td
                  className={`sticky left-0 z-10 min-w-[180px] border-l-4 bg-card px-3 py-2 ${
                    r.updatedToday ? "border-l-amber-deep" : "border-l-transparent"
                  }`}
                >
                  <Cell
                    value={r.project}
                    bold
                    readOnly={readOnly}
                    onSave={(v) => (v.trim() ? save(r, "project", v) : undefined)}
                  />
                  <p className="mt-0.5 font-body text-[10px] font-light text-muted" title={`Last updated ${indiaDate(r.updatedAt)}`}>
                    {r.updatedToday ? (
                      <span className="mr-1 rounded bg-amber-deep px-1.5 py-px font-bold uppercase tracking-wider text-cream">
                        Today
                      </span>
                    ) : null}
                    {indiaDate(r.updatedAt)}
                  </p>
                </td>
                {columns.map((c) => (
                  <td key={c.field} className={`border-l border-line px-3 py-2 ${c.wide ? "min-w-[220px]" : "min-w-[130px]"}`}>
                    <Cell value={r[c.field]} readOnly={readOnly} onSave={(v) => save(r, c.field, v)} />
                  </td>
                ))}
                <td className="px-2 py-2" data-print="hide">
                  {readOnly ? null : (
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() =>
                      arm(r.id, () => void call(r.id, `/api/stage-board/${r.id}`, { method: "DELETE" }, `${r.project} removed.`))
                    }
                    className={`whitespace-nowrap rounded border px-2 py-1 font-body text-[11px] transition-colors disabled:opacity-50 ${
                      armed === r.id
                        ? "border-alert bg-alert font-bold text-cream"
                        : "border-transparent font-light text-muted hover:border-alert hover:text-alert"
                    }`}
                  >
                    {armed === r.id ? "Sure?" : "Remove"}
                  </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A cell that turns into a text box when clicked. Enter or leaving it saves; Esc cancels. */
function Cell({
  value,
  bold,
  readOnly,
  onSave,
}: {
  value: string | null;
  bold?: boolean;
  readOnly?: boolean;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (readOnly) {
    return (
      <p
        title={value ?? undefined}
        className={`px-1 py-0.5 font-body text-[13px] [overflow-wrap:anywhere] ${
          bold ? "font-bold text-ink" : "font-light text-secondary"
        }`}
        style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
      >
        {value ?? <span className="text-muted/60">—</span>}
      </p>
    );
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 28)))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          setEditing(false);
          onSave(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(value ?? "");
            setEditing(false);
          }
        }}
        className={`${input} min-w-[120px] resize-y`}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      className={`block w-full rounded px-1 py-0.5 text-left font-body text-[13px] transition-colors hover:bg-hover [overflow-wrap:anywhere] ${
        bold ? "font-bold text-ink" : "font-light text-secondary"
      }`}
    >
      {value ? (
        /* Three lines, so one long note does not make its row a page tall —
           the whole of it is on hover, and in the box when clicked. */
        <span
          title={value}
          style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {value}
        </span>
      ) : (
        <span className="text-muted/60">—</span>
      )}
    </button>
  );
}

function AddForm({
  busy,
  tabTitle,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  tabTitle: string;
  onCancel: () => void;
  onSubmit: (project: string, member: string) => Promise<void>;
}) {
  const [project, setProject] = useState("");
  const [member, setMember] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(project.trim(), member.trim());
      }}
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-amber-deep/60 bg-card px-4 py-3"
      data-print="hide"
    >
      <label className="block min-w-[220px] flex-1">
        <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
          Project * · {tabTitle}
        </span>
        <input required autoFocus value={project} onChange={(e) => setProject(e.target.value)} className={input} />
      </label>
      <label className="block min-w-[180px]">
        <span className="mb-1 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
          Team member
        </span>
        <input value={member} onChange={(e) => setMember(e.target.value)} className={input} />
      </label>
      <button
        type="submit"
        disabled={busy || !project.trim()}
        className="rounded bg-ink px-3 py-1.5 font-body text-xs font-bold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Add"}
      </button>
      <button type="button" onClick={onCancel} className={smallBtn}>
        Cancel
      </button>
    </form>
  );
}
