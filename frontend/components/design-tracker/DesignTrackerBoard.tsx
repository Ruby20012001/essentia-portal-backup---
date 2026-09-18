"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DesignDashboardView } from "@/components/design-tracker/DesignDashboardView";
import { DesignDelaysView } from "@/components/design-tracker/DesignDelaysView";
import { DesignProjectsView } from "@/components/design-tracker/DesignProjectsView";
import { DesignRemindersView } from "@/components/design-tracker/DesignRemindersView";
import { DesignSetupView } from "@/components/design-tracker/DesignSetupView";
import { DesignTodayView } from "@/components/design-tracker/DesignTodayView";
import { DesignUpdateView } from "@/components/design-tracker/DesignUpdateView";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { HEAT_DOT, typeChangeMessage } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, forSegment, personRows, type Segment } from "@/lib/services/design-tracker-logic";

type Tab = "dashboard" | "today" | "update" | "projects" | "delays" | "reminders" | "setup";
type Banner = { tone: "error" | "success"; message: string };

/**
 * The Design Activity Tracker's client shell — the WIO board's shell, with a
 * person where the WIO board has a team.
 *
 * Same habits: every write re-fetches the whole board (one tick moves a
 * project's heat, its designer's counts and the dependency roll-up at once),
 * and every refusal is shown in the banner in the server's own words.
 */
export function DesignTrackerBoard({ initial }: { initial: DesignBoard }) {
  const [board, setBoard] = useState(initial);
  // A designer comes here to update, so that is where they land.
  const [tab, setTab] = useState<Tab>(initial.viewer.scope === "own" ? "update" : "dashboard");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Whose projects to show. Null = everybody, which is Vishakha's first page.
   * A designer sees only their own — the server sent nothing else — so for
   * them the lens is fixed to themselves.
   */
  const own = board.viewer.scope === "own";
  const [person, setPerson] = useState<string | null>(own ? board.viewer.personId : null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!printing) return;
    window.print();
    setPrinting(false);
  }, [printing]);

  const saveImage = useCallback(async () => {
    const area = document.getElementById("print-area");
    if (!area) return;
    setBanner(null);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(area, { backgroundColor: "#000000", scale: 2, useCORS: true });
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/jpeg", 0.92);
      a.download = `design-tracker-${board.settings.today}.jpg`;
      a.click();
    } catch {
      setBanner({ tone: "error", message: "Could not make the picture. Save this view works on any browser." });
    }
  }, [board.settings.today]);

  /**
   * Bumped whenever the screen must drop what somebody typed and show the
   * server's values again — after every write, refused or not. Blur-to-save
   * fields hold a draft; without this, a refused date stays in the box looking
   * saved.
   */
  const [revision, setRevision] = useState(0);

  /** True when the board was re-read. False = the server could not be reached. */
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/design-tracker");
      if (!response.ok) return false;
      setBoard(await response.json());
      return true;
    } catch {
      return false;
    } finally {
      setRevision((r) => r + 1);
    }
  }, []);

  const call = useCallback(
    async (busyKey: string, path: string, init: RequestInit, successMessage?: string): Promise<boolean> => {
      setBusyId(busyKey);
      setBanner(null);
      try {
        let response: Response;
        try {
          response = await fetch(path, {
            ...init,
            headers: { "Content-Type": "application/json", ...init.headers },
          });
        } catch {
          // The request never arrived: offline, or the server is down or
          // restarting. Say so, and say that nothing was saved.
          setRevision((r) => r + 1);
          setBanner({
            tone: "error",
            message:
              "Could not reach the server — nothing was saved. Check the connection, reload the page and try again.",
          });
          return false;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBanner({ tone: "error", message: data.error ?? `Request failed (${response.status})` });
          await refresh();
          return false;
        }
        const reread = await refresh();
        if (!reread) {
          setBanner({
            tone: "error",
            message: "Saved — but the board could not be re-read, so the screen may be behind. Reload the page.",
          });
        } else if (successMessage) {
          setBanner({ tone: "success", message: successMessage });
        }
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  /** Every project change goes here; a change of type says what it did to the chart. */
  const patchProject = (id: string, patch: Record<string, unknown>) => {
    const project = board.projects.find((p) => p.id === id);
    const message =
      patch.typeCode !== undefined && project
        ? typeChangeMessage(
            project.name,
            board.types.find((t) => t.code === patch.typeCode) ?? null,
            board.activities,
          )
        : undefined;
    void call(id, `/api/design-tracker/projects/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, message);
  };

  const showPerson = (id: string | null) => {
    setPerson(id);
    if (tab === "setup" || tab === "reminders") setTab("dashboard");
  };

  /**
   * Residential, commercial, or both. Applied once, here, to the projects every
   * tab reads — so Today, Projects and Delays always agree about what they are
   * counting. Setup gets the whole board: the chart is not per segment.
   */
  const [segment, setSegment] = useState<Segment | null>(null);
  const lens = useMemo(
    () => ({ ...board, projects: forSegment(board.projects, segment) }),
    [board, segment],
  );
  const team = personRows(lens.projects, board.people);

  const mine = forPerson(lens.projects, person);
  const selected = board.people.find((p) => p.id === person) ?? null;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "today", label: "Today" },
    { key: "update", label: "✓ Update", badge: mine.filter((p) => p.heat !== "DONE").length },
    { key: "projects", label: "Projects", badge: mine.filter((p) => p.heat !== "DONE").length },
    { key: "delays", label: "Delays", badge: mine.filter((p) => p.heat === "HOT").length },
    ...(board.can.manage
      ? [
          { key: "reminders" as const, label: "🔔 Reminders" },
          { key: "setup" as const, label: "Setup" },
        ]
      : []),
  ];
  const label = tabs.find((t) => t.key === tab)?.label ?? "";

  return (
    <div id="print-area" data-mode="view">
      <div data-print="board">
        <div className="hidden" data-print="only">
          <h1 className="font-body text-base font-bold">
            {board.settings.teamName} — Design Activity Tracker · {label}
          </h1>
          <p className="font-body text-xs">
            Read against {board.settings.today}
            {selected ? ` · ${selected.name}` : " · the whole team"}
            {segment ? ` · ${segment}` : ""}
          </p>
        </div>

        {banner ? (
          <div
            role="alert"
            className={`sticky top-0 z-20 mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm shadow-sm ${
              banner.tone === "error"
                ? "border-alert bg-card font-bold text-alert"
                : "border-forest bg-card font-light text-forest"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="flex-1">{banner.message}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                aria-label="Close this message"
                data-print="hide"
                className="-my-1 rounded px-2 py-0.5 text-lg leading-none text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                ×
              </button>
            </div>
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

          <span className="ml-auto py-2.5 font-body text-xs font-light text-muted">
            Read against <span className="font-bold text-secondary">{board.settings.today}</span>
            {board.settings.pinned ? " (pinned)" : ""}
          </span>

          {board.can.export ? (
            <span className="ml-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void saveImage()}
                className="rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-light text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                Save as JPG
              </button>
              <button
                type="button"
                onClick={() => setPrinting(true)}
                className="rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-light text-muted transition-colors hover:bg-hover hover:text-ink"
              >
                Save this view
              </button>
            </span>
          ) : null}
        </div>

        {/* The person lens — the WIO board's team chips. Vishakha's name first
            (the whole team), then each designer with a dot for their heat. */}
        {!own && tab !== "setup" && tab !== "reminders" ? (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
              Designer
            </span>
            <PersonChip
              label={board.people.find((p) => p.role === "head")?.name
                ? `${board.people.find((p) => p.role === "head")!.name}'s team · all`
                : "All"}
              count={lens.projects.filter((p) => p.heat !== "DONE").length}
              active={person === null}
              onClick={() => showPerson(null)}
            />
            {team
              .filter((row) => row.role === "designer" || row.counts.running + row.counts.done > 0)
              .map((row) => (
                <PersonChip
                  key={row.id}
                  label={row.name}
                  face={row.name}
                  count={row.counts.running}
                  dot={row.heat ? HEAT_DOT[row.heat] : undefined}
                  active={person === row.id}
                  onClick={() => showPerson(row.id)}
                />
              ))}
          </div>
        ) : null}

        {tab !== "setup" && tab !== "reminders" && board.types.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
              Type
            </span>
            {([null, "residential", "commercial"] as const).map((s) => (
              <PersonChip
                key={s ?? "all"}
                label={s === null ? "All" : s === "residential" ? "Residential" : "Commercial"}
                count={forSegment(forPerson(board.projects, person), s).filter((p) => p.heat !== "DONE").length}
                active={segment === s}
                onClick={() => setSegment(s)}
              />
            ))}
          </div>
        ) : null}

        {tab === "dashboard" ? (
          <DesignDashboardView board={lens} person={person} onPerson={showPerson} />
        ) : null}

        {tab === "today" ? (
          <DesignTodayView board={lens} person={person} onPerson={showPerson} />
        ) : null}

        {tab === "update" ? (
          <DesignUpdateView
            board={lens}
            person={person}
            busyId={busyId}
            onMarkDone={(projectId, activityIds, doneOn) =>
              call(projectId, `/api/design-tracker/projects/${projectId}/activities`, {
                method: "PUT",
                body: JSON.stringify({ activityIds, doneOn }),
              })
            }
            onSkip={(projectId, activityId, notApplicable) =>
              call(projectId, `/api/design-tracker/projects/${projectId}/activities/${activityId}`, {
                method: "PUT",
                body: JSON.stringify({ notApplicable }),
              })
            }
            onSetStart={(projectId, startDate) => patchProject(projectId, { startDate })}
            // An empty choice means "not set", which the API takes as null.
            onSetType={(projectId, typeCode) => patchProject(projectId, { typeCode: typeCode || null })}
          />
        ) : null}

        {tab === "projects" ? (
          <DesignProjectsView
            board={lens}
            person={person}
            segment={segment}
            revision={revision}
            busyId={busyId}
            onCreate={(input) =>
              call(
                "create",
                "/api/design-tracker/projects",
                { method: "POST", body: JSON.stringify(input) },
                `${String(input.name)} added to the board.`,
              )
            }
            onPatch={patchProject}
            onDelete={(id, name) =>
              void call(id, `/api/design-tracker/projects/${id}`, { method: "DELETE" }, `${name} removed from the board.`)
            }
            onMark={(projectId, activityId, mark) =>
              void call(projectId, `/api/design-tracker/projects/${projectId}/activities/${activityId}`, {
                method: "PUT",
                body: JSON.stringify(mark),
              })
            }
          />
        ) : null}

        {tab === "delays" ? <DesignDelaysView board={lens} person={person} onPerson={showPerson} /> : null}

        {tab === "reminders" && board.can.manage ? <DesignRemindersView /> : null}

        {tab === "setup" && board.can.manage ? (
          <DesignSetupView
            key={revision}
            board={board}
            busyId={busyId}
            onSettings={(patch) =>
              void call(
                "settings",
                "/api/design-tracker/settings",
                { method: "PATCH", body: JSON.stringify(patch) },
                patch.today === null
                  ? "The board follows the calendar again."
                  : patch.today
                    ? `Board pinned to ${String(patch.today)}.`
                    : "Setting updated.",
              )
            }
            onActivity={(id, patch) =>
              void call(id, `/api/design-tracker/activities/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, "Chart retuned.")
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function PersonChip({
  label,
  count,
  active,
  dot,
  face,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  /** A designer's chip carries her face; "all" and the type chips do not. */
  face?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
        active ? "border-line-strong bg-selected text-white" : "border-line bg-card text-secondary hover:bg-hover"
      }`}
    >
      {dot ? <span className={`mr-2 inline-block h-2 w-2 rounded-full ${dot}`} /> : null}
      {face ? <DesignAvatar name={face} size={18} /> : null}
      <span className={face ? "ml-1.5" : ""}>{label}</span>
      <span className="ml-2 font-light text-muted">{count === 0 ? "—" : count}</span>
    </button>
  );
}
