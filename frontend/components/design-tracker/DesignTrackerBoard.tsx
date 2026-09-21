"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DesignDashboardView } from "@/components/design-tracker/DesignDashboardView";
import { DesignDelaysView } from "@/components/design-tracker/DesignDelaysView";
import { DesignProjectsView } from "@/components/design-tracker/DesignProjectsView";
import { DesignRemindersView } from "@/components/design-tracker/DesignRemindersView";
import { DesignSetupView } from "@/components/design-tracker/DesignSetupView";
import { DesignTeamView } from "@/components/design-tracker/DesignTeamView";
import { DesignTodayView } from "@/components/design-tracker/DesignTodayView";
import { DesignUpdateView } from "@/components/design-tracker/DesignUpdateView";
import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { HEAT_DOT, typeChangeMessage } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, forSegment, personRows, type Segment } from "@/lib/services/design-tracker-logic";

type Tab =
  | "dashboard"
  | "today"
  | "team"
  | "update"
  | "projects"
  | "delays"
  | "reminders"
  | "setup";
type Banner = { tone: "error" | "success"; message: string };

/**
 * The Design Activity Tracker's client shell — the WIO board's shell, with a
 * person where the WIO board has a team.
 *
 * Same habits: every write re-fetches the whole board (one tick moves a
 * project's heat, its designer's counts and the dependency roll-up at once),
 * and every refusal is shown in the banner in the server's own words.
 */
export function DesignTrackerBoard({
  initial,
  openAt = null,
}: {
  initial: DesignBoard;
  /** A designer named in the address — the menu links straight to one. */
  openAt?: string | null;
}) {
  const [board, setBoard] = useState(initial);
  // A designer comes here to update, so that is where they land.
  /* A designer opens on ✓ Update — the card per project with one Done, which
     is what she came to do. Vishakha opens on the Dashboard, which is what she
     came to read. */
  const [tab, setTab] = useState<Tab>(initial.viewer.scope === "own" ? "update" : "dashboard");
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Whose projects to show. Null = everybody, which is Vishakha's first page.
   * A designer sees only their own — the server sent nothing else — so for
   * them the lens is fixed to themselves.
   */
  const own = board.viewer.scope === "own";
  /* A designer only ever sees themselves, so the address cannot move them;
     for the head it is how the menu opens one of her team directly. */
  const [person, setPerson] = useState<string | null>(
    own ? board.viewer.personId : openAt,
  );
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

  /* The address follows the chips, so the two can never say different things.
     replaceState rather than a router push: this is the same page looking at a
     different person, and it must not cost a round trip to the server or put a
     step in the back button for every chip pressed. */
  const showPerson = (id: string | null) => {
    setPerson(id);
    if (!own && typeof window !== "undefined") {
      const url = id ? `/design-tracker?person=${encodeURIComponent(id)}` : "/design-tracker";
      window.history.replaceState(null, "", url);
    }
    if (tab === "setup" || tab === "reminders") setTab("dashboard");
  };

  /* …and the chips follow the address. Pressing Dashboard in the menu while
     looking at one designer changed the address and nothing else: the lens had
     been read once, at first render, so the board went on showing that person
     under a heading that said everybody. */
  useEffect(() => {
    if (own) return;
    setPerson(openAt);
  }, [openAt, own]);

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

  /* Dashboard is not among them. It is where the page opens and it is reached
     again from the nav beside the ☰, so a tab for it was a second door into the
     room you were already standing in (Monica, 18 Sep). It is still a Tab — the
     view, the print header and the escape from Setup all go on naming it. */
  const tabs: { key: Tab; label: string; badge?: number }[] = [
    /* "What's new", not "Today" (Monica, 18 Sep). The page was never a diary of
       the day — it is where the board says what has moved and what is stuck,
       which is what somebody opening it is actually after. The Tab key stays
       "today" so no saved view or print header has to be migrated. */
    { key: "today", label: "What's new" },
    /* Team performance is the head's page. A designer is sent only her own
       projects, so it drew a single card — herself, measured against nobody —
       under a heading about a team she could not see (Monica, 19 Sep:
       "Vishakha ke alawa baki kisi me team performance hatana hai, wo to bas
       edit or report wale hain"). */
    ...(board.can.manage ? [{ key: "team" as const, label: "Team performance" }] : []),
    /* ✓ Update comes back, but only for whoever records work (Monica, 19 Sep:
       "un ke portal me option rakhna usi ke according, or Vishakha view wala
       hai bs").

       It was taken out on 18 Sep — "update htado" — said while looking at
       Vishakha's board, where it is indeed noise: she reads the board, she
       does not tick it. But it is the designers' one control, a card per
       project and a single Done, and taking it from them left the people who
       actually do the work opening a project, expanding it and finding the row
       by hand. It belongs in their portal and nowhere else. */
    ...(board.can.edit
      ? [
          {
            key: "update" as const,
            label: "✓ Update",
            badge: mine.filter((p) => p.heat !== "DONE").length,
          },
        ]
      : []),
    { key: "projects", label: "Projects", badge: mine.filter((p) => p.heat !== "DONE").length },
    { key: "delays", label: "Delays", badge: mine.filter((p) => p.heat === "HOT").length },
    ...(board.can.manage
      ? [
          { key: "reminders" as const, label: "🔔 Reminders" },
          { key: "setup" as const, label: "Setup" },
        ]
      : []),
  ];
  // Dashboard has no tab, so the printed sheet names it from here instead.
  const label = tabs.find((t) => t.key === tab)?.label ?? (tab === "dashboard" ? "Dashboard" : "");

  /* Whose board is being read — the thing the title says, and the reason the
     title lives in here rather than on the page around it. Monica, 21 Sep:
     "jab main kisi aur ke dashboard par jaun to upar usi ka naam hona
     chahiye." Narrowing to a designer does not reload the page (it is a
     replaceState, see showPerson), so a title rendered on the server would go
     on saying Vishakha while the board underneath showed Ritu. */
  const whose =
    (own ? board.viewer.name : selected?.name) ??
    board.people.find((p) => p.role === "head")?.name ??
    null;

  return (
    <div id="print-area" data-mode="view">
      <div data-print="board">
        <div className="mb-6" data-print="hide">
          <h1 className="mb-1 font-heading text-5xl leading-tight text-white md:text-6xl">
            {whose ? `${whose}'s Dashboard` : "Design Activity Tracker"}
          </h1>
          <p className="font-body text-sm font-light text-label">
            S4c · Design Activity Tracker — every project against the activity chart, what is
            late, and whom it depends on
            {board.settings.teamName ? ` · ${board.settings.teamName}` : ""}
          </p>
        </div>

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

          {/* The date and the two save buttons are one group, so when the row
              runs out of width they wrap together and stay to the right. Left
              to themselves they broke apart, and the buttons landed under the
              tabs looking like a second row of them. */}
          <span className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className="py-2.5 font-body text-xs font-light text-muted">
            Read against <span className="font-bold text-secondary">{board.settings.today}</span>
            {board.settings.pinned ? " (pinned)" : ""}
          </span>

          {board.can.export ? (
            <span className="flex items-center gap-2">
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
          </span>
        </div>

        {/* The person lens — the WIO board's team chips. Vishakha's name first
            (the whole team), then each designer with a dot for their heat.

            Not on Dashboard: that page carries a ring per designer which is
            itself the filter, so the chips repeated the same choice twice over
            (Monica, 18 Sep: "Lavika n all wo sab htado"). Every other tab reads
            names and dates, and still needs them. */}
        {!own &&
        tab !== "dashboard" &&
        tab !== "team" &&
        tab !== "setup" &&
        tab !== "reminders" ? (
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

        {/* Gated twice on purpose: hiding the tab stops it being pressed, this
            stops it being rendered at all if the tab is ever reached by some
            other road. */}
        {tab === "team" && board.can.manage ? (
          <DesignTeamView board={lens} onPerson={showPerson} />
        ) : null}

        {/* Gated twice, like Team performance: the tab is not offered to a
            reader, and the view is not drawn for one either. */}
        {tab === "update" && board.can.edit ? (
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
