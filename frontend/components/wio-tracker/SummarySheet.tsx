import type { TrackerBoard } from "@/lib/services/wio-tracker";
import {
  ALARM2_ESCALATES_TO,
  forTeam,
  holdingByStage,
  todayStats,
} from "@/lib/services/wio-tracker-logic";

/**
 * The board on one page, for someone who will not open the board.
 *
 * Ruby, 2026-09-03: "ek gist ki tarah ek single paper par saari info, CEO ko
 * bhejni hai, unke paas itna time nahi hai."
 *
 * So this is not the tracker made smaller — it is a different document with a
 * different job. The WIOs tab answers "what do I do next with this row"; this
 * answers "is the WIO → PIO window healthy, and if not, who is holding it up".
 * Four blocks, in the order the question is actually asked:
 *
 *   the numbers   ·  is anything wrong
 *   who is holding·  where it is stuck
 *   needs a call  ·  which specific ones, by name
 *   why           ·  the reasons behind them
 *
 * NOTHING IS RECOMPUTED HERE. Every figure comes from the same pure functions
 * the screen uses (todayStats, holdingByStage) applied to the same rows. A
 * summary that did its own arithmetic would eventually disagree with the board
 * it summarises, and the person reading it would be the last to find out.
 *
 * It honours the team lens, because a sheet that silently included the other
 * team's rows while the screen showed one team would be a lie by omission.
 *
 * Screen-hidden, print-only: it exists to become a PDF (see globals.css).
 */
export function SummarySheet({
  board,
  team,
}: {
  board: TrackerBoard;
  team: string | null;
}) {
  const wios = forTeam(board.wios, team);
  const stats = todayStats(wios, board.settings);
  const holding = holdingByStage(wios, board.stages)
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || b.longest - a.longest)
    .slice(0, 6);

  const running = wios.filter((w) => !w.pioReleased);

  // Worst first — the same order the board itself uses, so the sheet and the
  // screen never nominate different rows as urgent.
  const attention = running.filter((w) => w.status !== "On track").slice(0, 8);

  const openDelays = forTeam(board.delays, team).filter((d) => d.status === "Open");
  const byCause = [...openDelays.reduce((m, d) => m.set(d.cause, (m.get(d.cause) ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const teamName = team
    ? (board.teams.find((t) => t.code === team)?.name ?? team)
    : "both teams";

  const tiles: { label: string; value: number; note?: string }[] = [
    { label: "On the clock", value: stats.running },
    { label: "Overdue", value: stats.overdue, note: "past the 15-day window" },
    { label: "Late at this stage", value: stats.late },
    { label: "Sitting 5+ days", value: stats.stuckFivePlus },
    { label: "No WIO date", value: stats.noWioDate, note: "clock never started" },
    { label: "Open delays", value: openDelays.length },
    // ALARM 2 belongs on the sheet the CEO reads: it is escalated to him.
    { label: `Escalated to ${ALARM2_ESCALATES_TO}`, value: stats.escalated, note: "ALARM 2 · no selection by D-10" },
  ];

  return (
    <div className="hidden" data-print="summary">
      <header style={{ borderBottom: "1.5pt solid #000", paddingBottom: "4pt", marginBottom: "8pt" }}>
        <h1 style={{ fontSize: "13pt", fontWeight: 700, margin: 0 }}>
          WIO → PIO Tracker — where it stands
        </h1>
        <p style={{ fontSize: "8.5pt", margin: "2pt 0 0" }}>
          {board.settings.teamName} · {teamName} · read against {board.settings.today} ·
          {" "}
          {board.settings.windowDays}-day window
        </p>
      </header>

      {/* 1 — the numbers. */}
      <div style={{ display: "flex", gap: "6pt", marginBottom: "9pt" }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{ flex: 1, border: "0.5pt solid #999", padding: "5pt 6pt" }}
          >
            <div style={{ fontSize: "17pt", fontWeight: 700, lineHeight: 1 }}>{t.value}</div>
            <div style={{ fontSize: "7.5pt", fontWeight: 700, marginTop: "3pt" }}>{t.label}</div>
            {t.note ? <div style={{ fontSize: "6.5pt" }}>{t.note}</div> : null}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: "10pt", alignItems: "flex-start" }}>
        {/* 2 — where the work is sitting. */}
        <section style={{ flex: 1 }}>
          <h2 style={{ fontSize: "9pt", fontWeight: 700, margin: "0 0 3pt" }}>
            Who is holding it
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt" }}>
            <thead>
              <tr style={{ borderBottom: "0.5pt solid #999" }}>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>Stage</th>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>Waiting on</th>
                <th style={{ textAlign: "right", padding: "2pt 3pt" }}>Rows</th>
                <th style={{ textAlign: "right", padding: "2pt 3pt" }}>Longest</th>
              </tr>
            </thead>
            <tbody>
              {holding.map((h) => (
                <tr key={h.stage} style={{ borderBottom: "0.25pt solid #ccc" }}>
                  <td style={{ padding: "2pt 3pt" }}>{h.stage}</td>
                  <td style={{ padding: "2pt 3pt" }}>{h.waitingOn}</td>
                  <td style={{ padding: "2pt 3pt", textAlign: "right", fontWeight: 700 }}>{h.count}</td>
                  <td style={{ padding: "2pt 3pt", textAlign: "right" }}>{h.longest}d</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 3 — why. */}
          <h2 style={{ fontSize: "9pt", fontWeight: 700, margin: "9pt 0 3pt" }}>
            Why it is stuck
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt" }}>
            <tbody>
              {byCause.length === 0 ? (
                <tr>
                  <td style={{ padding: "2pt 3pt" }}>No delay is logged against any row.</td>
                </tr>
              ) : (
                byCause.map(([cause, n]) => (
                  <tr key={cause} style={{ borderBottom: "0.25pt solid #ccc" }}>
                    <td style={{ padding: "2pt 3pt" }}>{cause}</td>
                    <td style={{ padding: "2pt 3pt", textAlign: "right", fontWeight: 700 }}>{n}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        {/* 4 — the specific rows to ask about, by name. */}
        <section style={{ flex: 1.35 }}>
          <h2 style={{ fontSize: "9pt", fontWeight: 700, margin: "0 0 3pt" }}>
            Needs a decision
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "7.5pt" }}>
            <thead>
              <tr style={{ borderBottom: "0.5pt solid #999" }}>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>WIO</th>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>Project</th>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>Stage</th>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>With</th>
                <th style={{ textAlign: "right", padding: "2pt 3pt" }}>Days</th>
                <th style={{ textAlign: "left", padding: "2pt 3pt" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {attention.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: "2pt 3pt" }}>
                    Every running row reads On track.
                  </td>
                </tr>
              ) : (
                attention.map((w) => (
                  <tr key={w.id} style={{ borderBottom: "0.25pt solid #ccc" }}>
                    <td style={{ padding: "2pt 3pt", whiteSpace: "nowrap" }}>{w.wio}</td>
                    <td style={{ padding: "2pt 3pt" }}>{w.project ?? "—"}</td>
                    <td style={{ padding: "2pt 3pt" }}>{w.stage}</td>
                    <td style={{ padding: "2pt 3pt" }}>{w.accountability}</td>
                    <td style={{ padding: "2pt 3pt", textAlign: "right" }}>{w.daysHere}</td>
                    <td style={{ padding: "2pt 3pt", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {w.status}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>

      {/*
        The caveat travels with the sheet. Without it the top-left number reads
        as "the work in hand", when a large share of those rows have no issue
        date and are therefore on no clock at all — the finding the board exists
        to surface, and the one most easily lost in a summary.
      */}
      {stats.noWioDate > 0 ? (
        <p style={{ fontSize: "7pt", marginTop: "9pt", borderTop: "0.5pt solid #999", paddingTop: "4pt" }}>
          {stats.noWioDate} of {stats.running} running rows carry no WIO issue date, so their
          {" "}{board.settings.windowDays}-day clock has never started. They cannot be late — they
          are untracked, and are counted here as neither on time nor overdue.
        </p>
      ) : null}
    </div>
  );
}
