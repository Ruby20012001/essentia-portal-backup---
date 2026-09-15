import {
  ALARM2_ESCALATES_TO,
  type ComputedWio,
  type TrackerSettings,
} from "@/lib/services/wio-tracker-logic";

/**
 * ALARM 2 by email — which WIOs go to Hardesh sir, and what the email says.
 *
 * The marked-up countdown (rev A), D-10: "Escalation to Hardesh sir as well."
 * The printed sheet: "The desk raises them on the day, by name, to the person
 * and their department head. An alarm is not a reminder — it is a record that
 * the window is now at risk and who put it there."
 *
 * PURE, like wio-tracker-logic.ts: no database, no clock, no network. Sending
 * and recording live in wio-tracker-alarms.ts. Keeping the choice of WIOs and
 * the wording here is what lets both be pinned by tests
 * (tests/unit/wio-tracker-alarm-mail.test.ts) without mailing anyone.
 */

export const ALARM2 = "ALARM 2";

/**
 * The WIOs an ALARM 2 email should name today: running, escalated on the
 * board, and not already emailed successfully. Earliest D-10 first — the one
 * that has been waiting longest is the one to read first.
 */
export function alarm2Due(
  rows: ComputedWio[],
  alreadySent: ReadonlySet<string>,
): ComputedWio[] {
  return rows
    .filter(
      (w) => !w.pioReleased && w.selectionState === "Escalated" && !alreadySent.has(w.id),
    )
    .sort(
      (a, b) =>
        (a.selectionDue ?? "").localeCompare(b.selectionDue ?? "") ||
        a.wio.localeCompare(b.wio),
    );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type Alarm2Email = { subject: string; text: string; html: string };

/**
 * One email for the day, naming every WIO by number — not one email per WIO.
 * A founder's inbox is the last place to fill with a row each.
 */
export function renderAlarm2Email(
  rows: ComputedWio[],
  settings: TrackerSettings,
  boardUrl: string,
  teamNames: Record<string, string>,
): Alarm2Email {
  const n = rows.length;
  const plural = n === 1 ? "" : "s";
  const subject = `ALARM 2 — ${n} WIO${plural}: selection appointment not held by D-10`;

  const intro =
    `${n === 1 ? "This WIO has" : "These WIOs have"} passed D-10 without the client ` +
    `selection appointment being held. D-10 is the hard deadline on the WIO → PIO ` +
    `countdown, and under ALARM 2 it is escalated to you.`;

  const describe = (w: ComputedWio) => ({
    wio: w.wio,
    what: [w.project ?? "No project named", w.scope].filter(Boolean).join(" · "),
    team: teamNames[w.teamCode] ?? w.teamCode,
    due: w.selectionDue ?? "—",
    where: `${w.stage} — with ${w.accountability}`,
    raisedBy: w.raisedBy ?? "not named",
  });

  const text = [
    `${ALARM2_ESCALATES_TO},`,
    "",
    intro,
    "",
    ...rows.flatMap((w) => {
      const d = describe(w);
      return [
        `${d.wio} — ${d.what}`,
        `  ${d.team} · raised by ${d.raisedBy} · D-10 was ${d.due} · now at ${d.where}`,
        "",
      ];
    }),
    `The board is read against ${settings.today}.`,
    `Open the board: ${boardUrl}`,
    "",
    "An alarm is not a reminder — it is a record that the window is now at risk.",
    "Sent once per WIO by the WIO → PIO Tracker.",
  ].join("\n");

  const cell = "padding:6px 10px;border-bottom:1px solid #e5e5e5;vertical-align:top";
  const html =
    `<div style="font-family:Helvetica,Arial,sans-serif;color:#111;font-size:14px;line-height:1.5">` +
    `<p style="font-size:12px;color:#777;margin:0 0 14px">essentia · WIO → PIO Tracker</p>` +
    `<p style="margin:0 0 6px"><strong>${escapeHtml(ALARM2_ESCALATES_TO)},</strong></p>` +
    `<p style="margin:0 0 16px">${escapeHtml(intro)}</p>` +
    `<table style="border-collapse:collapse;width:100%;font-size:13px;margin:0 0 16px">` +
    `<tr style="text-align:left;background:#f5f5f5">` +
    `<th style="${cell}">WIO</th><th style="${cell}">Project / scope</th>` +
    `<th style="${cell}">Team · raised by</th><th style="${cell}">D-10 was</th>` +
    `<th style="${cell}">Now at</th></tr>` +
    rows
      .map((w) => {
        const d = describe(w);
        return (
          `<tr><td style="${cell}"><strong>${escapeHtml(d.wio)}</strong></td>` +
          `<td style="${cell}">${escapeHtml(d.what)}</td>` +
          `<td style="${cell}">${escapeHtml(d.team)} · ${escapeHtml(d.raisedBy)}</td>` +
          `<td style="${cell}">${escapeHtml(d.due)}</td>` +
          `<td style="${cell}">${escapeHtml(d.where)}</td></tr>`
        );
      })
      .join("") +
    `</table>` +
    `<p style="margin:0 0 6px">The board is read against ${escapeHtml(settings.today)}. ` +
    `<a href="${escapeHtml(boardUrl)}">Open the board</a></p>` +
    `<p style="font-size:12px;color:#777;margin:16px 0 0">An alarm is not a reminder — it is a ` +
    `record that the window is now at risk. Sent once per WIO by the WIO → PIO Tracker.</p>` +
    `</div>`;

  return { subject, text, html };
}
