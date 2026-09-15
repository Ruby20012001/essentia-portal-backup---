import { describe, expect, it } from "vitest";
import {
  computeBoard,
  type TrackerSettings,
  type TrackerStage,
  type TrackerWioInput,
} from "@/lib/services/wio-tracker-logic";
import { alarm2Due, renderAlarm2Email } from "@/lib/services/wio-tracker-alarm-mail";

/**
 * ALARM 2 by email (db/049) — which WIOs are named, and what Hardesh sir reads.
 * Nothing here sends anything; the choice and the wording are pure.
 */

const STAGES: TrackerStage[] = [
  { id: "s1", position: 1, stage: "Archive pass", waitingOn: "PD team", doneBy: 14 },
  { id: "s4", position: 2, stage: "Finishes", waitingOn: "Roopdeep + CRM", doneBy: 13 },
  { id: "s6", position: 3, stage: "Final SLD", waitingOn: "Design team", doneBy: 9 },
  { id: "s9", position: 4, stage: "PIO", waitingOn: "WIO raised by", doneBy: 0 },
];

const SETTINGS: TrackerSettings = {
  teamName: "WIO team",
  windowDays: 15,
  atRiskFrom: 5,
  today: "2026-09-05",
  stampedBy: null,
  stampedAt: null,
};

function row(over: Partial<TrackerWioInput>): TrackerWioInput {
  return {
    id: "w",
    wio: "ED/26-27/000",
    teamCode: "neeraj",
    project: "Test Residence",
    scope: "Wardrobes 2 nos",
    raisedBy: "Nimisha",
    wioIssued: "2026-08-24",
    stageId: "s1",
    since: "2026-08-24",
    notes: null,
    pioReleased: null,
    pioNo: null,
    acknowledged: null,
    selectionHeld: null,
    windowDays: null,
    ...over,
  };
}

// Issued 2026-08-24 → PIO due 2026-09-08 → D-10 was 2026-08-29; read on 09-05.
const board = computeBoard(
  [
    row({ id: "a", wio: "ED/26-27/130" }),
    row({ id: "b", wio: "ED/26-27/129" }),
    row({ id: "c", wio: "ED/26-27/131", selectionHeld: "2026-08-28" }), // held in time
    row({ id: "d", wio: "ED/26-27/132", stageId: "s6" }), // past Finishes — not escalated
    row({ id: "e", wio: "ED/26-27/133", pioReleased: "2026-09-01" }), // released
    row({ id: "f", wio: "ED/26-27/134", wioIssued: null }), // no WIO date
    row({ id: "g", wio: "ED/26-27/120", wioIssued: "2026-08-20" }), // D-10 was 2026-08-25
  ],
  STAGES,
  SETTINGS,
  new Map(),
);

const TEAMS = { neeraj: "Neeraj's team", dipmallya: "Dipmallya's team" };
const URL = "https://tracker.example/board";

describe("which WIOs the ALARM 2 email names", () => {
  it("only running WIOs escalated on the board, earliest D-10 first", () => {
    expect(alarm2Due(board, new Set()).map((w) => w.wio)).toEqual([
      "ED/26-27/120",
      "ED/26-27/129",
      "ED/26-27/130",
    ]);
  });

  it("never names a WIO already emailed successfully — the CEO hears once", () => {
    expect(alarm2Due(board, new Set(["g", "b"])).map((w) => w.wio)).toEqual(["ED/26-27/130"]);
  });

  it("names nothing when every escalated WIO has been sent", () => {
    expect(alarm2Due(board, new Set(["a", "b", "g"]))).toEqual([]);
  });
});

describe("what the ALARM 2 email says", () => {
  const due = alarm2Due(board, new Set());
  const mail = renderAlarm2Email(due, SETTINGS, URL, TEAMS);

  it("says ALARM 2 and how many WIOs in the subject", () => {
    expect(mail.subject).toBe("ALARM 2 — 3 WIOs: selection appointment not held by D-10");
    expect(renderAlarm2Email(due.slice(0, 1), SETTINGS, URL, TEAMS).subject).toBe(
      "ALARM 2 — 1 WIO: selection appointment not held by D-10",
    );
  });

  it("is addressed to Hardesh sir and names every WIO, its D-10 date, team and holder", () => {
    expect(mail.text.startsWith("Hardesh sir,")).toBe(true);
    for (const w of ["ED/26-27/120", "ED/26-27/129", "ED/26-27/130"]) {
      expect(mail.text).toContain(w);
      expect(mail.html).toContain(w);
    }
    expect(mail.text).toContain("D-10 was 2026-08-29");
    expect(mail.text).toContain("Neeraj's team");
    expect(mail.text).toContain("now at Archive pass — with PD team");
  });

  it("says which date the board was read against, and links to it", () => {
    expect(mail.text).toContain("read against 2026-09-05");
    expect(mail.text).toContain(URL);
    expect(mail.html).toContain(`href="${URL}"`);
  });

  it("escapes what the team typed, so a project name cannot break the email", () => {
    const risky = computeBoard(
      [row({ id: "x", wio: "ED/26-27/999", project: "<b>A & B</b>" })],
      STAGES,
      SETTINGS,
      new Map(),
    );
    const html = renderAlarm2Email(risky, SETTINGS, URL, TEAMS).html;
    expect(html).toContain("&lt;b&gt;A &amp; B&lt;/b&gt;");
    expect(html).not.toContain("<b>A & B</b>");
  });
});
