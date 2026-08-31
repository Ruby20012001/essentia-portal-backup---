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
 * silently (CLAUDE.md).
 */
export function WioTrackerBoard({ initial }: { initial: TrackerBoard }) {
  const [board, setBoard] = useState(initial);
  const [tab, setTab] = useState<Tab>("today");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  return (
    <div>
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

      <div className="mb-6 flex flex-wrap items-center gap-1 border-b border-line">
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
      </div>

      {tab === "today" ? <TodayView board={board} /> : null}

      {tab === "wios" ? (
        <WiosView
          board={board}
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
