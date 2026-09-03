"use client";

import { useCallback, useState } from "react";
import { DelaysView } from "@/components/wio-tracker/DelaysView";
import { SetupView } from "@/components/wio-tracker/SetupView";
import { TodayView } from "@/components/wio-tracker/TodayView";
import { WiosView } from "@/components/wio-tracker/WiosView";
import type { TrackerBoard } from "@/lib/services/wio-tracker";
import type { ComputedWio } from "@/lib/services/wio-tracker-logic";

type Tab = "today" | "wios" | "delays" | "setup";
type Banner = { tone: "error" | "success"; message: string };

/**
 * S4b client shell. Owns board state and every mutation.
 *
 * After any write the whole board is re-fetched rather than patched locally.
 * That is deliberate: one stage change moves days-here, status, priority,
 * the sort order, the stage roll-up and eight dashboard tiles at once. Local
 * patching would recompute a subset and the screen would drift from the
 * server's answer — the exact class of bug the derived-not-stored design
 * exists to prevent.
 *
 * Every refusal surfaces verbatim in the banner. The system never blocks
 * silently (house rule).
 */
export function WioTrackerBoard({ initial }: { initial: TrackerBoard }) {
  const [board, setBoard] = useState(initial);
  const [tab, setTab] = useState<Tab>("today");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Which team's rows to show — null is the whole board, and it is the default
   * on purpose. Both teams work the whole board (db/032); the filter is a lens
   * someone chooses, not a fence they are put behind, so the board opens
   * showing everything and narrows only when asked.
   */
  const [team, setTeam] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/wio-tracker");
    if (response.ok) setBoard(await response.json());
  }, []);

  const call = useCallback(
    async (
      busyKey: string,
      path: string,
      init: RequestInit,
      successMessage?: string,
    ): Promise<boolean> => {
      setBusyId(busyKey);
      setBanner(null);
      try {
        const response = await fetch(path, {
          ...init,
          headers: { "Content-Type": "application/json", ...init.headers },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setBanner({
            tone: "error",
            message: data.error ?? `Request failed (${response.status})`,
          });
          return false;
        }
        await refresh();
        if (successMessage) setBanner({ tone: "success", message: successMessage });
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [refresh],
  );

  const patchWio = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const row = board.wios.find((w) => w.id === id);
      const movingTo =
        patch.stageId && row
          ? board.stages.find((s) => s.id === patch.stageId)?.stage
          : undefined;
      void call(
        id,
        `/api/wio-tracker/wios/${id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
        // Says what the system did on the user's behalf. The re-stamp is the
        // step the workbook relied on people remembering.
        movingTo
          ? `${row!.wio} moved to ${movingTo} — "at this stage since" re-stamped to ${board.settings.today}.`
          : undefined,
      );
    },
    [board.wios, board.stages, board.settings.today, call],
  );

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "today", label: "Today" },
    { key: "wios", label: "WIOs", badge: board.wios.filter((w) => !w.pioReleased).length },
    {
      key: "delays",
      label: "Delays",
      badge: board.delays.filter((d) => d.status === "Open").length,
    },
    { key: "setup", label: "Setup" },
  ];

  const label = tabs.find((t) => t.key === tab)?.label ?? "";

  return (
    <div id="print-area">
      {/* Paper needs the heading the screen gets from the shell around it:
          on a printed page there is no header, no nav and no tab strip, so a
          sheet without this says nothing about which board or which day. */}
      <div className="hidden" data-print="only">
        <h1 className="font-body text-base font-bold">
          {board.settings.teamName} — WIO → PIO Tracker · {label}
        </h1>
        <p className="font-body text-xs">
          Read against {board.settings.today}
          {team
            ? ` · ${board.teams.find((t) => t.code === team)?.name ?? team}`
            : " · both teams"}
        </p>
      </div>
      {banner ? (
        <div
          role="alert"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 font-bold text-alert"
              : "border-forest bg-forest/5 font-light text-forest"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <div
        className="mb-6 flex flex-wrap items-center gap-1 border-b border-line"
        data-print="hide"
      >
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
            {t.badge !== undefined ? (
              <span className="ml-2 font-light text-muted">{t.badge}</span>
            ) : null}
          </button>
        ))}

        <span className="ml-auto py-2.5 font-body text-xs font-light text-muted">
          Read against{" "}
          <span className="font-bold text-secondary">{board.settings.today}</span>
          {board.can.edit ? (
            <button
              type="button"
              onClick={() => setTab("setup")}
              className="ml-2 underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink"
            >
              re-stamp
            </button>
          ) : null}
        </span>

        {/* Saving is printing: the browser's own "Save as PDF" turns this
            view into a file, so there is no second rendering of the board to
            drift from the real one. What you see is exactly what is saved. */}
        {board.can.export ? (
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-3 rounded border border-line-strong bg-canvas px-3 py-1.5 font-body text-xs font-bold text-secondary transition-colors hover:bg-hover hover:text-ink"
          >
            Save as PDF
          </button>
        ) : null}
      </div>

      {/* The team lens. Sits above the tabs because it applies to all of them —
          Today, WIOs and Delays all narrow together, so a person looking at
          "Neeraj" never has one screen disagree with another. */}
      {tab !== "setup" && board.teams.length > 1 ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className="font-body text-[11px] font-light uppercase tracking-[0.14em] text-muted">
            Team
          </span>
          <TeamChip
            label="All"
            count={board.wios.length}
            active={team === null}
            onClick={() => setTeam(null)}
          />
          {board.teams.map((t) => {
            const count = board.wios.filter((w) => w.teamCode === t.code).length;
            return (
              <TeamChip
                key={t.code}
                label={t.name}
                count={count}
                active={team === t.code}
                onClick={() => setTeam(t.code)}
                title={t.servesCrmTl ? `Serves ${t.servesCrmTl}'s projects` : undefined}
              />
            );
          })}
          {team !== null ? (
            <span className="font-body text-xs font-light text-muted">
              Showing one team. Both teams work the whole board — this is a
              filter, not a fence.
            </span>
          ) : null}
        </div>
      ) : null}

      {tab === "today" ? <TodayView board={board} team={team} /> : null}

      {tab === "wios" ? (
        <WiosView
          board={board}
          team={team}
          busyId={busyId}
          onPatch={patchWio}
          onCreate={(input) =>
            call(
              "create",
              "/api/wio-tracker/wios",
              { method: "POST", body: JSON.stringify(input) },
              `${input.wio} added to the board.`,
            )
          }
          onDelete={(w: ComputedWio) =>
            void call(
              w.id,
              `/api/wio-tracker/wios/${w.id}`,
              { method: "DELETE" },
              `${w.wio} removed from the board.`,
            )
          }
        />
      ) : null}

      {tab === "delays" ? (
        <DelaysView
          board={board}
          team={team}
          busyId={busyId}
          onCreate={(input) =>
            call(
              "delay",
              "/api/wio-tracker/delays",
              { method: "POST", body: JSON.stringify(input) },
              "Delay logged.",
            )
          }
          onPatch={(id, patch) =>
            void call(
              id,
              `/api/wio-tracker/delays/${id}`,
              { method: "PATCH", body: JSON.stringify(patch) },
              patch.status === "Closed" ? "Delay closed." : undefined,
            )
          }
        />
      ) : null}

      {tab === "setup" ? (
        <SetupView
          board={board}
          busyId={busyId}
          onSettings={(patch) =>
            void call(
              "settings",
              "/api/wio-tracker/settings",
              { method: "PATCH", body: JSON.stringify(patch) },
              patch.today
                ? `Board stamped ${patch.today} — every figure now reads against that date.`
                : "Setting updated.",
            )
          }
          onStage={(id, patch) =>
            void call(
              id,
              `/api/wio-tracker/stages/${id}`,
              { method: "PATCH", body: JSON.stringify(patch) },
              "Stage retuned.",
            )
          }
        />
      ) : null}
    </div>
  );
}

function TeamChip({
  label,
  count,
  active,
  title,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded border px-3 py-1.5 font-body text-xs font-bold transition-colors ${
        active
          ? "border-line-strong bg-selected text-white"
          : "border-line bg-card text-secondary hover:bg-hover"
      }`}
    >
      {label}
      {/* An em dash, not 0 — a team with no rows yet reads as "nothing here",
          which is true, rather than as a suspicious zero. */}
      <span className="ml-2 font-light text-muted">{count === 0 ? "—" : count}</span>
    </button>
  );
}
