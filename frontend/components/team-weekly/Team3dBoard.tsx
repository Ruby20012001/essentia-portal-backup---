"use client";

import { useCallback, useState } from "react";
import { downloadSheet, SaveBar } from "@/components/team-weekly/SaveBar";
import type { Project3d, Stage3d, Team3dBoard as Board } from "@/lib/services/team-weekly";

/**
 * The 3D page — Team Neeru and Team Dhruv. Pick a team card and its projects
 * open in three columns, Ongoing → Revisions → Signoff.
 *
 * Moving a project is the thing done most, so there are three ways to do it:
 * drag the card to another column, the ← / → arrows on the card, or the stage
 * list inside it. Dragging is the quick one on a laptop; the arrows are the
 * one that works on a phone, where drag-and-drop does not.
 */

const STAGES: { key: Stage3d; label: string; hint: string }[] = [
  { key: "ongoing", label: "Ongoing", hint: "being modelled" },
  { key: "revisions", label: "Revisions", hint: "back with changes" },
  { key: "signoff", label: "Signoff", hint: "approved" },
];
const ORDER: Stage3d[] = ["ongoing", "revisions", "signoff"];
// Ongoing neutral, Revisions orange (it came back), Signoff green (it is done).
const STAGE_TOP: Record<Stage3d, string> = {
  ongoing: "border-t-line-strong",
  revisions: "border-t-warning",
  signoff: "border-t-forest",
};
const STAGE_BAR: Record<Stage3d, string> = {
  ongoing: "bg-secondary/60",
  revisions: "bg-warning",
  signoff: "bg-forest",
};
const STAGE_TEXT: Record<Stage3d, string> = {
  ongoing: "text-secondary",
  revisions: "text-warning",
  signoff: "text-forest",
};

const label = "font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted";
const input =
  "w-full rounded border border-line-strong bg-canvas px-2.5 py-1.5 font-body text-[13px] font-light text-ink placeholder:text-muted focus:border-amber-deep focus:outline-none";
const smallBtn =
  "rounded border border-line-strong bg-canvas px-2.5 py-1 font-body text-xs font-light text-muted transition-colors hover:bg-hover hover:text-ink disabled:opacity-40";

type CallFn = (key: string, path: string, init: RequestInit, success?: string) => Promise<boolean>;

function updatedOn(s: string): string {
  return new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}
function stageLabel(s: Stage3d): string {
  return STAGES.find((x) => x.key === s)?.label ?? s;
}

export function Team3dBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [teamId, setTeamId] = useState<string | null>(initial.teams[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/team-weekly/3d", { cache: "no-store" });
    if (response.ok) setBoard(await response.json());
  }, []);

  const call: CallFn = useCallback(
    async (key, path, init, success) => {
      setBusy(key);
      setBanner(null);
      try {
        const response = await fetch(path, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBanner({ tone: "error", message: data.error ?? `Request failed (${response.status})` });
          await refresh();
          return false;
        }
        await refresh();
        if (success) setBanner({ tone: "success", message: success });
        return true;
      } finally {
        setBusy(null);
        setArmed(null);
      }
    },
    [refresh],
  );

  /** Move at once on screen, then save — a drag that waits on the network feels broken. */
  const move = useCallback(
    (p: Project3d, stage: Stage3d) => {
      if (p.stage === stage) return;
      setBoard((b) => ({ ...b, projects: b.projects.map((x) => (x.id === p.id ? { ...x, stage } : x)) }));
      void call(
        p.id,
        `/api/team-weekly/3d/${p.id}`,
        { method: "PATCH", body: JSON.stringify({ stage }) },
        `${p.name} moved to ${stageLabel(stage)}.`,
      );
    },
    [call],
  );

  const arm = (key: string, action: () => void) => {
    if (armed === key) {
      action();
      return;
    }
    setArmed(key);
    window.setTimeout(() => setArmed((k) => (k === key ? null : k)), 3500);
  };

  const team = board.teams.find((t) => t.id === teamId) ?? null;
  const q = search.trim().toLowerCase();
  const mine = board.projects.filter(
    (p) =>
      p.teamId === teamId &&
      (!q || [p.name, p.client ?? "", p.notes ?? ""].some((v) => v.toLowerCase().includes(q))),
  );

  return (
    <div id="print-area">
      <div className="hidden" data-print="only">
        <h1 className="font-body text-base font-bold">3D Board · {team?.name ?? ""}</h1>
        <p className="font-body text-xs">
          {STAGES.map((s) => `${s.label} ${mine.filter((p) => p.stage === s.key).length}`).join(" · ")}
          {q ? ` · matching “${search.trim()}”` : ""}
        </p>
      </div>
      {banner ? (
        <div
          role="status"
          data-print="hide"
          className={`mb-6 flex items-center justify-between gap-3 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
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

      {/* The teams, as cards: who has how much where, before anything is opened. */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2" data-print="hide">
        {board.teams.map((t) => {
          const theirs = board.projects.filter((p) => p.teamId === t.id);
          const total = theirs.length;
          const active = t.id === teamId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTeamId(t.id)}
              className={`group rounded-lg border px-5 py-4 text-left transition-all duration-200 ${
                active
                  ? "border-amber-deep bg-selected shadow-[0_0_0_1px_rgb(var(--c-amber-deep))]"
                  : "border-line bg-card hover:-translate-y-0.5 hover:border-line-strong hover:bg-hover"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className={`font-body text-lg font-bold ${active ? "text-white" : "text-ink"}`}>{t.name}</span>
                <span className="font-body text-2xl font-light tabular-nums text-white">{total}</span>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded bg-surface">
                {ORDER.map((s) => {
                  const n = theirs.filter((p) => p.stage === s).length;
                  return n ? (
                    <div
                      key={s}
                      className={`${STAGE_BAR[s]} transition-all duration-500`}
                      style={{ width: `${(n / total) * 100}%` }}
                    />
                  ) : null;
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-xs font-light">
                {ORDER.map((s) => (
                  <span key={s} className={STAGE_TEXT[s]}>
                    {stageLabel(s)} <span className="font-bold">{theirs.filter((p) => p.stage === s).length}</span>
                  </span>
                ))}
              </div>
              <span className="mt-3 block font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted group-hover:text-secondary">
                {active ? "Open below ↓" : "Click to open"}
              </span>
            </button>
          );
        })}
      </div>

      {team ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-print="hide">
            <h2 className="font-heading text-xl text-white">{team.name}</h2>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search a project, client or note"
                aria-label="Search projects"
                className={`${input.replace("w-full", "w-full sm:w-72")}`}
              />
              <SaveBar
                saving={busy !== null}
                onFile={() =>
                  downloadSheet(
                    `3d-${team.name.replace(/\s+/g, "-").toLowerCase()}.csv`,
                    ORDER.flatMap((s) =>
                      mine
                        .filter((p) => p.stage === s)
                        .map((p) => ({
                          Team: team.name,
                          Stage: stageLabel(p.stage),
                          Project: p.name,
                          Client: p.client,
                          Notes: p.notes,
                          Updated: updatedOn(p.updatedAt),
                        })),
                    ),
                    ["Team", "Stage", "Project", "Client", "Notes", "Updated"],
                  )
                }
              />
            </div>
          </div>
          <p className="mb-4 font-body text-xs font-light text-muted" data-print="hide">
            Drag a card to another column to move it — or use the ← → arrows on the card.
          </p>

          <div className="grid gap-4 lg:grid-cols-3">
            {STAGES.map((s) => (
              <StageColumn
                key={s.key}
                stage={s.key}
                title={s.label}
                hint={s.hint}
                teamId={team.id}
                teamName={team.name}
                projects={mine.filter((p) => p.stage === s.key)}
                searching={q !== ""}
                busy={busy}
                armed={armed}
                arm={arm}
                call={call}
                move={move}
                dragging={dragging}
                setDragging={setDragging}
                allProjects={board.projects}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="font-body text-sm font-light text-secondary">No teams on the 3D board yet.</p>
      )}
    </div>
  );
}

function StageColumn({
  stage,
  title,
  hint,
  teamId,
  teamName,
  projects,
  searching,
  busy,
  armed,
  arm,
  call,
  move,
  dragging,
  setDragging,
  allProjects,
}: {
  stage: Stage3d;
  title: string;
  hint: string;
  teamId: string;
  teamName: string;
  projects: Project3d[];
  searching: boolean;
  busy: string | null;
  armed: string | null;
  arm: (key: string, action: () => void) => void;
  call: CallFn;
  move: (p: Project3d, stage: Stage3d) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
  allProjects: Project3d[];
}) {
  const [adding, setAdding] = useState(false);
  const [over, setOver] = useState(false);
  const dragged = dragging ? allProjects.find((p) => p.id === dragging) : undefined;
  const canDrop = !!dragged && dragged.stage !== stage;

  return (
    <section
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (dragged && canDrop) move(dragged, stage);
        setDragging(null);
      }}
      className={`min-w-0 rounded-lg border border-t-4 px-4 py-4 transition-colors duration-150 ${STAGE_TOP[stage]} ${
        over ? "border-amber-deep bg-selected" : canDrop ? "border-dashed border-line-strong bg-card" : "border-line bg-card"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-heading text-lg text-white">
            {title}
            <span className="ml-2 font-body text-sm font-light tabular-nums text-muted">{projects.length}</span>
          </h3>
          <p className="font-body text-[11px] font-light text-muted">{hint}</p>
        </div>
        <button type="button" onClick={() => setAdding(!adding)} className={smallBtn} data-print="hide">
          {adding ? "Close" : "+ Add"}
        </button>
      </div>

      {adding ? (
        <ProjectForm
          busy={busy === `new-${stage}`}
          submitLabel={`Add to ${title}`}
          onCancel={() => setAdding(false)}
          onSubmit={async (v) => {
            const ok = await call(
              `new-${stage}`,
              "/api/team-weekly/3d",
              { method: "POST", body: JSON.stringify({ teamId, stage, ...v }) },
              `${v.name} added to ${teamName} · ${title}.`,
            );
            if (ok) setAdding(false);
            return ok;
          }}
        />
      ) : null}

      <div className="grid min-h-[64px] gap-2.5">
        {over ? (
          <div className="rounded border-2 border-dashed border-amber-deep px-3 py-3 text-center font-body text-xs font-bold text-amber-deep">
            Drop here → {title}
          </div>
        ) : null}
        {projects.length === 0 && !adding && !over ? (
          <p className="rounded border border-dashed border-line-strong px-3 py-4 text-center font-body text-xs font-light text-muted">
            {searching ? "Nothing matches here." : `Nothing in ${title.toLowerCase()} for ${teamName}.`}
          </p>
        ) : null}
        {projects.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            busy={busy === p.id}
            armed={armed === p.id}
            arm={arm}
            call={call}
            move={move}
            isDragging={dragging === p.id}
            setDragging={setDragging}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectCard({
  project: p,
  busy,
  armed,
  arm,
  call,
  move,
  isDragging,
  setDragging,
}: {
  project: Project3d;
  busy: boolean;
  armed: boolean;
  arm: (key: string, action: () => void) => void;
  call: CallFn;
  move: (p: Project3d, stage: Stage3d) => void;
  isDragging: boolean;
  setDragging: (id: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const at = ORDER.indexOf(p.stage);
  const prev = at > 0 ? ORDER[at - 1] : null;
  const next = at < ORDER.length - 1 ? ORDER[at + 1] : null;

  if (editing) {
    return (
      <ProjectForm
        initial={p}
        busy={busy}
        submitLabel="Save"
        onCancel={() => setEditing(false)}
        onSubmit={async (v) => {
          const ok = await call(p.id, `/api/team-weekly/3d/${p.id}`, { method: "PATCH", body: JSON.stringify(v) }, "Saved.");
          if (ok) setEditing(false);
          return ok;
        }}
      />
    );
  }

  return (
    <div
      draggable={!busy}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.id);
        setDragging(p.id);
      }}
      onDragEnd={() => setDragging(null)}
      className={`group cursor-grab rounded border bg-canvas px-3 py-2.5 transition-all duration-150 active:cursor-grabbing ${
        isDragging
          ? "scale-[0.98] border-amber-deep opacity-50"
          : "border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md"
      } ${busy ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <p className="font-body text-sm font-bold text-ink [overflow-wrap:anywhere]">{p.name}</p>
          {p.client ? <p className="font-body text-xs font-light text-secondary">{p.client}</p> : null}
          {!open && p.notes ? (
            <p className="mt-1 truncate font-body text-xs font-light text-muted">{p.notes}</p>
          ) : null}
        </button>
        <div className="flex shrink-0 gap-1" data-print="hide">
          <button
            type="button"
            disabled={!prev || busy}
            onClick={() => prev && move(p, prev)}
            title={prev ? `Back to ${stageLabel(prev)}` : undefined}
            aria-label={prev ? `Move ${p.name} back to ${stageLabel(prev)}` : "Already at the first stage"}
            className="h-7 w-7 rounded border border-line-strong font-body text-sm text-secondary transition-colors hover:border-amber-deep hover:text-amber-deep disabled:invisible"
          >
            ←
          </button>
          <button
            type="button"
            disabled={!next || busy}
            onClick={() => next && move(p, next)}
            title={next ? `On to ${stageLabel(next)}` : undefined}
            aria-label={next ? `Move ${p.name} on to ${stageLabel(next)}` : "Already signed off"}
            className="h-7 w-7 rounded border border-line-strong font-body text-sm text-secondary transition-colors hover:border-amber-deep hover:text-amber-deep disabled:invisible"
          >
            →
          </button>
        </div>
      </div>

      {open ? (
        <div className="mt-2 border-t border-line pt-2">
          {p.notes ? (
            <p className="whitespace-pre-line font-body text-xs font-light text-secondary [overflow-wrap:anywhere]">{p.notes}</p>
          ) : (
            <p className="font-body text-xs font-light text-muted">No notes yet.</p>
          )}
          <p className="mt-2 font-body text-[11px] font-light text-muted">
            {stageLabel(p.stage)} · updated {updatedOn(p.updatedAt)}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5" data-print="hide">
            <button type="button" disabled={busy} onClick={() => setEditing(true)} className={smallBtn}>
              Edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                arm(p.id, () => void call(p.id, `/api/team-weekly/3d/${p.id}`, { method: "DELETE" }, `${p.name} removed.`))
              }
              className={`rounded border px-2.5 py-1 font-body text-xs transition-colors disabled:opacity-50 ${
                armed
                  ? "border-alert bg-alert font-bold text-cream"
                  : "border-line-strong bg-canvas font-light text-muted hover:border-alert hover:text-alert"
              }`}
            >
              {armed ? "Sure? Click again" : "Remove"}
            </button>
          </div>
        </div>
      ) : (
        <p
          className="mt-1.5 font-body text-[10px] font-light text-muted opacity-0 transition-opacity group-hover:opacity-100"
          data-print="hide"
        >
          Click to open · drag to move
        </p>
      )}
    </div>
  );
}

function ProjectForm({
  initial,
  busy,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial?: Project3d;
  busy: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (v: { name: string; client: string | null; notes: string | null }) => Promise<boolean>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [client, setClient] = useState(initial?.client ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit({ name: name.trim(), client: client.trim() || null, notes: notes.trim() || null });
      }}
      className="mb-3 grid gap-3 rounded border border-amber-deep/60 bg-canvas px-3 py-3"
      data-print="hide"
    >
      <label className="block">
        <span className={`mb-1 block ${label}`}>Project *</span>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sharma residence"
          className={input}
        />
      </label>
      <label className="block">
        <span className={`mb-1 block ${label}`}>Client</span>
        <input value={client} onChange={(e) => setClient(e.target.value)} className={input} />
      </label>
      <label className="block">
        <span className={`mb-1 block ${label}`}>Notes</span>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What is happening on it" className={input} />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded bg-ink px-3 py-1.5 font-body text-xs font-bold text-canvas transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Saving…" : submitLabel}
        </button>
        <button type="button" onClick={onCancel} className={smallBtn}>
          Cancel
        </button>
      </div>
    </form>
  );
}
