import { describe, expect, it } from "vitest";
import {
  ALARM2_ESCALATES_TO,
  SELECTION_DAY,
  forTeam,
  addDays,
  computeBoard,
  computeWio,
  daysBetween,
  holdingByStage,
  todayStats,
  toneFor,
  type TrackerSettings,
  type TrackerStage,
  type TrackerWioInput,
} from "@/lib/services/wio-tracker-logic";

/**
 * WIO → PIO Tracker derivation (Brief §29-30).
 *
 * These tests are the contract with the team's original workbook: every rule
 * below was a formula in the spreadsheet before it was code, and the numbers
 * on the board are only trustworthy while they still agree. The chain as first
 * seeded (db/031) is the fixture most tests run on — the derivation does not
 * care which chain it is given, and those day numbers make the arithmetic easy
 * to follow. The live chain since db/045 (countdown rev A: no GFC, no BOM, a
 * Final SLD at D-9) has its own block at the end, and db/validate.mjs pins the
 * migrated rows themselves.
 */

const STAGES: TrackerStage[] = [
  { id: "s1", position: 1, stage: "Archive pass", waitingOn: "PD team", doneBy: 14 },
  { id: "s2", position: 2, stage: "SLD · Design", waitingOn: "Design team", doneBy: 10 },
  { id: "s3", position: 3, stage: "SLD · Architecture", waitingOn: "Architecture team", doneBy: 10 },
  { id: "s4", position: 4, stage: "Finishes", waitingOn: "Roopdeep + CRM", doneBy: 9 },
  { id: "s5", position: 5, stage: "GFC", waitingOn: "Design Room", doneBy: 4 },
  { id: "s6", position: 6, stage: "FG code", waitingOn: "Shruti + CRM", doneBy: 3 },
  { id: "s7", position: 7, stage: "BOM", waitingOn: "Parul", doneBy: 3 },
  { id: "s8", position: 8, stage: "Sign-off", waitingOn: "Khushpreet + Yogi", doneBy: 2 },
  { id: "s9", position: 9, stage: "Client sign-off", waitingOn: "Client", doneBy: 2 },
  { id: "s10", position: 10, stage: "PIO", waitingOn: "WIO raised by", doneBy: 0 },
];

const SETTINGS: TrackerSettings = {
  teamName: "Dipmallya's team",
  windowDays: 15,
  atRiskFrom: 5,
  today: "2026-08-25",
  stampedBy: null,
  stampedAt: null,
};

function wio(over: Partial<TrackerWioInput> = {}): TrackerWioInput {
  return {
    id: "w1",
    wio: "ED/26-27/100",
    teamCode: "dipmallya",
    project: "Test Residence",
    scope: "Test scope",
    raisedBy: "Nimisha",
    wioIssued: "2026-08-20",
    stageId: "s5",
    since: "2026-08-24",
    notes: null,
    pioReleased: null,
    pioNo: null,
    acknowledged: null,
    selectionHeld: null,
    ...over,
  };
}

const compute = (over: Partial<TrackerWioInput> = {}, delays = 0) =>
  computeWio(wio(over), STAGES, SETTINGS, delays);

describe("calendar-day arithmetic", () => {
  it("counts whole days and is signed", () => {
    expect(daysBetween("2026-08-20", "2026-08-25")).toBe(5);
    expect(daysBetween("2026-08-25", "2026-08-20")).toBe(-5);
    expect(daysBetween("2026-08-25", "2026-08-25")).toBe(0);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-08-25", "2026-09-01")).toBe(7);
    expect(addDays("2026-12-28", 5)).toBe("2027-01-02");
    expect(addDays("2026-08-25", -4)).toBe("2026-08-21");
  });

  it("is timezone-independent — a DST-shifting date still counts whole days", () => {
    // India has no DST but CI does not run in India. These spans are exact.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });
});

describe("pioDue, daysLeft, daysHere", () => {
  it("pioDue is wioIssued + windowDays", () => {
    expect(compute({ wioIssued: "2026-08-20" }).pioDue).toBe("2026-09-04");
  });

  it("pioDue is null when the clock never started", () => {
    const r = compute({ wioIssued: null });
    expect(r.pioDue).toBeNull();
    expect(r.daysLeft).toBeNull();
    expect(r.thisStageDue).toBeNull();
  });

  it("daysLeft is pioDue - today", () => {
    // 2026-08-20 + 15 = 2026-09-04; today 2026-08-25 → 10 left.
    expect(compute({ wioIssued: "2026-08-20" }).daysLeft).toBe(10);
  });

  it("daysLeft is n/a (null) once released — never a misleading zero", () => {
    expect(compute({ pioReleased: "2026-08-24" }).daysLeft).toBeNull();
  });

  it("daysHere is today - since, floored at zero", () => {
    expect(compute({ since: "2026-08-20" }).daysHere).toBe(5);
    expect(compute({ since: "2026-08-25" }).daysHere).toBe(0);
    // A `since` stamped in the future is a typo, not negative time.
    expect(compute({ since: "2026-08-30" }).daysHere).toBe(0);
    expect(compute({ since: null }).daysHere).toBe(0);
  });

  it("thisStageDue is pioDue - the stage's doneBy", () => {
    // GFC (doneBy 4): 2026-09-04 − 4 = 2026-08-31.
    expect(compute({ stageId: "s5" }).thisStageDue).toBe("2026-08-31");
    // Archive pass (doneBy 14): 2026-09-04 − 14 = 2026-08-21.
    expect(compute({ stageId: "s1" }).thisStageDue).toBe("2026-08-21");
    // PIO (doneBy 0) is due on the PIO date itself.
    expect(compute({ stageId: "s10" }).thisStageDue).toBe("2026-09-04");
  });
});

describe("dayLabel", () => {
  it("released wins over everything", () => {
    expect(compute({ pioReleased: "2026-08-24", wioIssued: null }).dayLabel).toBe("PIO released");
  });

  it("no WIO date asks for the WIO date", () => {
    expect(compute({ wioIssued: null }).dayLabel).toBe("Add the WIO date");
  });

  it("counts down while in the window, including the last day", () => {
    expect(compute({ wioIssued: "2026-08-20" }).dayLabel).toBe("D-10");
    expect(compute({ wioIssued: "2026-08-10" }).dayLabel).toBe("D-0");
  });

  it("counts up past the window", () => {
    // 2026-08-05 + 15 = 2026-08-20; today 2026-08-25 → 5 over.
    expect(compute({ wioIssued: "2026-08-05" }).dayLabel).toBe("OVERDUE +5");
  });
});

describe("accountability", () => {
  it("is the stage's waitingOn for every stage but the last", () => {
    expect(compute({ stageId: "s5" }).accountability).toBe("Design Room");
    expect(compute({ stageId: "s8" }).accountability).toBe("Khushpreet + Yogi");
  });

  it("resolves to whoever raised the WIO at the PIO stage", () => {
    expect(compute({ stageId: "s10", raisedBy: "Nimisha" }).accountability).toBe("Nimisha");
  });

  it("says 'not named' rather than blaming a blank at the PIO stage", () => {
    expect(compute({ stageId: "s10", raisedBy: null }).accountability).toBe("not named");
    expect(compute({ stageId: "s10", raisedBy: "   " }).accountability).toBe("not named");
  });
});

describe("upcomingStage", () => {
  it("names the next stage and who it goes to", () => {
    expect(compute({ stageId: "s5" }).upcomingStage).toBe("FG code  ·  Shruti + CRM");
  });

  it("resolves the raised-by placeholder when the next stage is PIO", () => {
    expect(compute({ stageId: "s9", raisedBy: "Rohit" }).upcomingStage).toBe("PIO  ·  Rohit");
  });

  it("says so at the end of the chain", () => {
    expect(compute({ stageId: "s10" }).upcomingStage).toBe("— last stage");
  });

  it("is a dash once released", () => {
    expect(compute({ pioReleased: "2026-08-24" }).upcomingStage).toBe("—");
  });
});

describe("status — priority order, first match wins", () => {
  it("1. released beats everything, including a blown window", () => {
    expect(compute({ wioIssued: "2026-07-01", pioReleased: "2026-08-20" }).status).toBe("Released");
  });

  it("2. no WIO date reads 'Not tracked', never a reassuring 'On track'", () => {
    expect(compute({ wioIssued: null }).status).toBe("Not tracked");
  });

  it("3. past the PIO date is OVERDUE", () => {
    expect(compute({ wioIssued: "2026-08-05" }).status).toBe("OVERDUE");
  });

  it("4. inside the window but past THIS stage's deadline is LATE HERE", () => {
    // GFC doneBy 4. Issued 2026-08-18 → due 2026-09-02 → 8 days left.
    // 8 >= 4, so not late here yet.
    expect(compute({ wioIssued: "2026-08-18", stageId: "s5" }).status).toBe("On track");
    // Archive pass doneBy 14 on the same row: 8 < 14 → late at this stage,
    // even though the overall window is nowhere near blown.
    expect(compute({ wioIssued: "2026-08-18", stageId: "s1" }).status).toBe("LATE HERE");
  });

  it("LATE HERE outranks At risk when both would apply", () => {
    // Issued 2026-08-13 → due 2026-08-28 → 3 days left. atRiskFrom is 5, so
    // At risk applies; GFC doneBy 4 means 3 < 4, so LATE HERE wins.
    const r = compute({ wioIssued: "2026-08-13", stageId: "s5" });
    expect(r.daysLeft).toBe(3);
    expect(r.status).toBe("LATE HERE");
  });

  it("5. At risk once daysLeft is at or under the threshold", () => {
    // Issued 2026-08-15 → due 2026-08-30 → 5 left. PIO stage doneBy 0, so the
    // LATE HERE branch cannot fire and At risk is reached at exactly 5.
    const r = compute({ wioIssued: "2026-08-15", stageId: "s10" });
    expect(r.daysLeft).toBe(5);
    expect(r.status).toBe("At risk");
  });

  it("6. otherwise On track", () => {
    expect(compute({ wioIssued: "2026-08-20", stageId: "s10" }).status).toBe("On track");
  });

  it("a WIO due today is not yet overdue", () => {
    const r = compute({ wioIssued: "2026-08-10", stageId: "s10" });
    expect(r.daysLeft).toBe(0);
    expect(r.status).toBe("At risk");
  });
});

describe("colour rule — red is rare and means something", () => {
  it("maps statuses to the house tones", () => {
    expect(toneFor("On track")).toBe("green");
    expect(toneFor("Released")).toBe("green");
    expect(toneFor("At risk")).toBe("orange");
    expect(toneFor("LATE HERE")).toBe("red");
    expect(toneFor("OVERDUE")).toBe("red");
    expect(toneFor("Not tracked")).toBe("neutral");
  });

  it("reserves red for exactly two statuses — nothing else defaults to it", () => {
    const red = (["On track", "Released", "At risk", "LATE HERE", "OVERDUE", "Not tracked"] as const)
      .filter((s) => toneFor(s) === "red");
    expect(red).toEqual(["LATE HERE", "OVERDUE"]);
  });
});

describe("priority score", () => {
  it("overdue scores 60 plus time parked", () => {
    // Issued 2026-08-05 → overdue. since 2026-08-24 → 1 day here.
    expect(compute({ wioIssued: "2026-08-05", since: "2026-08-24" }).priority).toBe(61);
  });

  it("late-here scores 40", () => {
    const r = compute({ wioIssued: "2026-08-18", stageId: "s1", since: "2026-08-25" });
    expect(r.status).toBe("LATE HERE");
    expect(r.priority).toBe(40);
  });

  it("at-risk scores 20", () => {
    const r = compute({ wioIssued: "2026-08-15", stageId: "s10", since: "2026-08-25" });
    expect(r.status).toBe("At risk");
    expect(r.priority).toBe(20);
  });

  it("adds days parked, capped at 20 so one ancient row cannot outrank every fire", () => {
    expect(compute({ wioIssued: "2026-08-20", since: "2026-08-18" }).priority).toBe(7);
    expect(compute({ wioIssued: "2026-08-20", since: "2026-01-01" }).priority).toBe(20);
  });

  it("adds 5 per open delay", () => {
    expect(compute({ wioIssued: "2026-08-20", since: "2026-08-25" }, 3).priority).toBe(15);
  });

  it("scores nothing for lateness once released", () => {
    const r = compute({ wioIssued: "2026-07-01", pioReleased: "2026-08-20", since: "2026-08-25" });
    expect(r.priority).toBe(0);
  });

  it("a row with no WIO date carries no lateness score — it is unknown, not urgent", () => {
    const r = compute({ wioIssued: null, since: "2026-08-25" });
    expect(r.status).toBe("Not tracked");
    expect(r.priority).toBe(0);
  });
});

describe("computeBoard — worst first", () => {
  const rows: TrackerWioInput[] = [
    wio({ id: "a", wio: "ED/26-27/001", wioIssued: "2026-08-20", stageId: "s10", since: "2026-08-25" }),
    wio({ id: "b", wio: "ED/26-27/002", wioIssued: "2026-08-05", stageId: "s5", since: "2026-08-24" }),
    wio({ id: "c", wio: "ED/26-27/003", wioIssued: "2026-08-15", stageId: "s10", since: "2026-08-25" }),
  ];

  it("sorts by priority descending", () => {
    const board = computeBoard(rows, STAGES, SETTINGS, new Map());
    expect(board.map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(board[0]!.status).toBe("OVERDUE");
  });

  it("open delays lift a row past a more-urgent-looking peer", () => {
    // a is On track (0) and c is At risk (20), so c normally outranks a.
    // Five open delays (+25) put a above c — someone has flagged it five times
    // and it is still sitting there.
    const board = computeBoard(rows, STAGES, SETTINGS, new Map([["a", 5]]));
    expect(board.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("but delays never lift a row past something genuinely overdue", () => {
    // b is OVERDUE (60 + 1 day parked = 61). a with five delays reaches 25.
    // Lateness dominates by design; delays break ties, they do not outrank fire.
    const board = computeBoard(rows, STAGES, SETTINGS, new Map([["a", 5]]));
    expect(board[0]!.id).toBe("b");
    expect(board[0]!.status).toBe("OVERDUE");
  });

  it("is stable — the same unchanged data sorts the same way twice", () => {
    const once = computeBoard(rows, STAGES, SETTINGS, new Map()).map((r) => r.id);
    const twice = computeBoard([...rows].reverse(), STAGES, SETTINGS, new Map()).map((r) => r.id);
    expect(once).toEqual(twice);
  });

  it("refuses to guess when a row points outside the chain", () => {
    expect(() => computeWio(wio({ stageId: "nope" }), STAGES, SETTINGS, 0)).toThrow(
      /not in the chain/,
    );
  });
});

describe("Today roll-ups", () => {
  const rows: TrackerWioInput[] = [
    wio({ id: "a", wio: "A", wioIssued: "2026-08-25", stageId: "s5", since: "2026-08-25" }),
    wio({ id: "b", wio: "B", wioIssued: "2026-08-05", stageId: "s5", since: "2026-08-10" }),
    wio({ id: "c", wio: "C", wioIssued: null, stageId: "s2", since: "2026-08-24" }),
    wio({ id: "d", wio: "D", wioIssued: "2026-08-01", stageId: "s5", since: "2026-08-01", pioReleased: "2026-08-25", pioNo: "ED/26-27/900" }),
    wio({ id: "e", wio: "E", wioIssued: "2026-08-18", stageId: "s1", since: "2026-08-19" }),
  ];
  const board = computeBoard(rows, STAGES, SETTINGS, new Map());
  const stats = todayStats(board, SETTINGS);

  it("counts today's issues and releases against the STAMPED date", () => {
    expect(stats.wiosIssuedToday).toBe(1);
    expect(stats.piosReleasedToday).toBe(1);
  });

  it("counts running rows, excluding released ones", () => {
    expect(stats.running).toBe(4);
  });

  it("counts rows that moved a stage today", () => {
    expect(stats.movedAStageToday).toBe(1);
  });

  it("counts rows stuck 5+ days at their current stage", () => {
    // b (15 days) and e (6 days). c has been 1 day, a 0.
    expect(stats.stuckFivePlus).toBe(2);
  });

  it("splits late, overdue and untracked", () => {
    expect(stats.overdue).toBe(1); // b
    expect(stats.late).toBe(1); // e — Archive pass, doneBy 14
    expect(stats.noWioDate).toBe(1); // c
  });

  it("a released row never counts as running, stuck, late or overdue", () => {
    expect(stats.running + 1).toBe(rows.length);
  });
});

describe("who is holding what", () => {
  const rows: TrackerWioInput[] = [
    wio({ id: "a", wio: "A", stageId: "s5", since: "2026-08-20" }),
    wio({ id: "b", wio: "B", stageId: "s5", since: "2026-08-10" }),
    wio({ id: "c", wio: "C", stageId: "s2", since: "2026-08-24" }),
    wio({ id: "d", wio: "D", stageId: "s5", since: "2026-08-01", pioReleased: "2026-08-20" }),
  ];
  const holding = holdingByStage(computeBoard(rows, STAGES, SETTINGS, new Map()), STAGES);

  it("returns one row per stage, in chain order, including empty stages", () => {
    expect(holding).toHaveLength(STAGES.length);
    expect(holding.map((h) => h.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("counts only running rows and totals the days waiting", () => {
    const gfc = holding.find((h) => h.stage === "GFC")!;
    expect(gfc.count).toBe(2); // d is released
    expect(gfc.totalDaysWaiting).toBe(5 + 15);
  });

  it("names the single longest-waiting row so it can be asked about", () => {
    const gfc = holding.find((h) => h.stage === "GFC")!;
    expect(gfc.longest).toBe(15);
    expect(gfc.longestWio).toBe("B");
  });

  it("an empty stage reports zero rather than being hidden", () => {
    const bom = holding.find((h) => h.stage === "BOM")!;
    expect(bom.count).toBe(0);
    expect(bom.longestWio).toBeNull();
  });
});

describe("the team lens", () => {
  const rows: TrackerWioInput[] = [
    wio({ id: "a", wio: "A", teamCode: "dipmallya", wioIssued: "2026-08-05", stageId: "s5", since: "2026-08-20" }),
    wio({ id: "b", wio: "B", teamCode: "dipmallya", wioIssued: "2026-08-20", stageId: "s10", since: "2026-08-25" }),
    wio({ id: "c", wio: "C", teamCode: "neeraj", wioIssued: "2026-08-15", stageId: "s10", since: "2026-08-24" }),
  ];
  const board = computeBoard(rows, STAGES, SETTINGS, new Map());

  it("null shows the whole board", () => {
    expect(forTeam(board, null)).toHaveLength(3);
  });

  it("narrows to one team", () => {
    expect(forTeam(board, "dipmallya").map((r) => r.wio)).toEqual(["A", "B"]);
    expect(forTeam(board, "neeraj").map((r) => r.wio)).toEqual(["C"]);
  });

  it("an unknown team shows nothing rather than everything", () => {
    // Fail closed. Silently falling back to the whole board would show one
    // team another team's rows under that team's own label.
    expect(forTeam(board, "nobody")).toHaveLength(0);
  });

  it("roll-ups over a team are the same arithmetic, not a second implementation", () => {
    const all = todayStats(board, SETTINGS);
    const dip = todayStats(forTeam(board, "dipmallya"), SETTINGS);
    const nee = todayStats(forTeam(board, "neeraj"), SETTINGS);

    expect(all.overdue).toBe(1); // A
    expect(dip.overdue).toBe(1);
    expect(nee.overdue).toBe(0);

    // Every count partitions cleanly: the parts sum to the whole.
    expect(dip.running + nee.running).toBe(all.running);
    expect(dip.overdue + nee.overdue).toBe(all.overdue);
    expect(dip.noWioDate + nee.noWioDate).toBe(all.noWioDate);
  });

  it("the stage roll-up narrows with the team and still lists every stage", () => {
    const nee = holdingByStage(forTeam(board, "neeraj"), STAGES);
    expect(nee).toHaveLength(STAGES.length);
    expect(nee.find((h) => h.stage === "PIO")!.count).toBe(1);
    expect(nee.find((h) => h.stage === "GFC")!.count).toBe(0);
  });

  it("a team with no rows yet reports zero, not the whole board", () => {
    const empty = forTeam(board, "neeraj").filter(() => false);
    const stats = todayStats(empty, SETTINGS);
    expect(stats.running).toBe(0);
    expect(stats.overdue).toBe(0);
  });
});

describe("the chain is configuration, not constants", () => {
  it("a retuned doneBy moves the LATE HERE line without a code change", () => {
    const relaxed = STAGES.map((s) => (s.id === "s5" ? { ...s, doneBy: 12 } : s));
    const row = wio({ wioIssued: "2026-08-18", stageId: "s5" });
    expect(computeWio(row, STAGES, SETTINGS, 0).status).toBe("On track");
    expect(computeWio(row, relaxed, SETTINGS, 0).status).toBe("LATE HERE");
  });

  it("a renamed stage keeps its accountability via the raised-by placeholder", () => {
    const renamed = STAGES.map((s) =>
      s.id === "s10" ? { ...s, stage: "PIO release" } : s,
    );
    const r = computeWio(wio({ stageId: "s10", raisedBy: "Rohit" }), renamed, SETTINGS, 0);
    expect(r.accountability).toBe("Rohit");
  });

  it("a retuned window moves every derived date", () => {
    const wider: TrackerSettings = { ...SETTINGS, windowDays: 20 };
    expect(computeWio(wio({ wioIssued: "2026-08-20" }), STAGES, wider, 0).pioDue).toBe("2026-09-09");
  });

  it("the stamped date is the only clock — moving it moves the whole board", () => {
    const later: TrackerSettings = { ...SETTINGS, today: "2026-09-10" };
    const r = computeWio(wio({ wioIssued: "2026-08-20" }), STAGES, later, 0);
    expect(r.status).toBe("OVERDUE");
    expect(r.dayLabel).toBe("OVERDUE +6");
  });
});

describe("the 24-hour acknowledgement (countdown rev A)", () => {
  // Stamped today is 2026-08-25. s1 is the first stage (Archive pass).

  it("is due the day after the WIO is issued", () => {
    expect(compute({ wioIssued: "2026-08-20" }).ackDue).toBe("2026-08-21");
    expect(compute({ wioIssued: null }).ackDue).toBeNull();
  });

  it("reads Awaiting while the 24 hours are still running", () => {
    expect(compute({ wioIssued: "2026-08-24", stageId: "s1" }).ackState).toBe("Awaiting");
  });

  it("reads Not acknowledged once the day has passed at the first stage", () => {
    expect(compute({ wioIssued: "2026-08-23", stageId: "s1" }).ackState).toBe("Not acknowledged");
  });

  it("tells an on-time acknowledgement from a late one", () => {
    expect(
      compute({ wioIssued: "2026-08-23", stageId: "s1", acknowledged: "2026-08-24" }).ackState,
    ).toBe("Acknowledged");
    expect(
      compute({ wioIssued: "2026-08-23", stageId: "s1", acknowledged: "2026-08-23" }).ackState,
    ).toBe("Acknowledged");
    expect(
      compute({ wioIssued: "2026-08-23", stageId: "s1", acknowledged: "2026-08-25" }).ackState,
    ).toBe("Acknowledged late");
  });

  it("does not flag a row that has moved past the first stage, and invents no date", () => {
    const r = compute({ wioIssued: "2026-08-10", stageId: "s2" });
    expect(r.ackState).toBe("Not recorded");
    expect(r.acknowledged).toBeNull();
  });

  it("does not apply without a WIO date or once released", () => {
    expect(compute({ wioIssued: null, stageId: "s1" }).ackState).toBe("n/a");
    expect(compute({ wioIssued: "2026-08-10", stageId: "s1", pioReleased: "2026-08-24" }).ackState).toBe("n/a");
  });

  it("never changes status, colour or priority — it explains, it does not escalate", () => {
    const silent = compute({ wioIssued: "2026-08-23", stageId: "s1", since: "2026-08-23" });
    const acked = compute({ wioIssued: "2026-08-23", stageId: "s1", since: "2026-08-23", acknowledged: "2026-08-24" });
    expect(silent.ackState).toBe("Not acknowledged");
    expect([silent.status, silent.tone, silent.priority]).toEqual([acked.status, acked.tone, acked.priority]);
  });

  it("is counted on Today over running rows only", () => {
    const rows = [
      wio({ id: "a", wio: "A", wioIssued: "2026-08-23", stageId: "s1" }),
      wio({ id: "b", wio: "B", wioIssued: "2026-08-24", stageId: "s1" }),
      wio({ id: "c", wio: "C", wioIssued: "2026-08-20", stageId: "s1", pioReleased: "2026-08-25" }),
    ];
    const stats = todayStats(computeBoard(rows, STAGES, SETTINGS, new Map()), SETTINGS);
    expect(stats.notAcknowledged).toBe(1);
  });
});

describe("the chain as marked up — countdown rev A (db/045 + db/046)", () => {
  const REV_A: TrackerStage[] = [
    { id: "a1", position: 1, stage: "Archive pass", waitingOn: "PD team", doneBy: 14 },
    { id: "a2", position: 2, stage: "SLD · Design", waitingOn: "Design team", doneBy: 10 },
    { id: "a3", position: 3, stage: "SLD · Architecture", waitingOn: "Architecture team", doneBy: 10 },
    { id: "a4", position: 4, stage: "Finishes", waitingOn: "Roopdeep + CRM", doneBy: 13 },
    { id: "a5", position: 5, stage: "FG code", waitingOn: "Shruti + CRM", doneBy: 13 },
    { id: "a6", position: 6, stage: "Final SLD", waitingOn: "Design team", doneBy: 9 },
    { id: "a7", position: 7, stage: "SLD approvals", waitingOn: "Jyoti + Yogi + Vishakha + TL", doneBy: 6 },
    { id: "a8", position: 8, stage: "Client sign-off", waitingOn: "Client", doneBy: 2 },
    { id: "a9", position: 9, stage: "PIO", waitingOn: "WIO raised by", doneBy: 0 },
  ];
  const at = (stageId: string, over: Partial<TrackerWioInput> = {}) =>
    computeWio(wio({ stageId, ...over }), REV_A, SETTINGS, 0);

  it("carries no GFC and no BOM", () => {
    expect(REV_A.map((s) => s.stage)).not.toContain("GFC");
    expect(REV_A.map((s) => s.stage)).not.toContain("BOM");
  });

  it("Finishes and FG code are both due at D-13, four days before the Final SLD", () => {
    // Issued 2026-08-20 → PIO due 2026-09-04 → D-13 is 2026-08-22.
    expect(at("a4", { wioIssued: "2026-08-20" }).thisStageDue).toBe("2026-08-22");
    expect(at("a5", { wioIssued: "2026-08-20" }).thisStageDue).toBe("2026-08-22");
  });

  it("FG code comes ahead of the Final SLD, due at D-9", () => {
    expect(at("a4").upcomingStage).toBe("FG code  ·  Shruti + CRM");
    expect(at("a5").upcomingStage).toBe("Final SLD  ·  Design team");
    expect(at("a6", { wioIssued: "2026-08-20" }).thisStageDue).toBe("2026-08-26");
    expect(at("a6").upcomingStage).toBe("SLD approvals  ·  Jyoti + Yogi + Vishakha + TL");
  });

  it("SLD approvals are held by the named approvers and close at D-6", () => {
    const r = at("a7", { wioIssued: "2026-08-20" });
    expect(r.accountability).toBe("Jyoti + Yogi + Vishakha + TL");
    expect(r.thisStageDue).toBe("2026-08-29");
    expect(r.upcomingStage).toBe("Client sign-off  ·  Client");
  });
});

describe("ALARM 2 — selection appointment by D-10, escalated to Hardesh sir", () => {
  // Stamped today is 2026-08-25. In the fixture chain s4 is Finishes, s5 is past it.

  it("is due at D-10: the PIO date less ten days", () => {
    // Issued 2026-08-20 → PIO due 2026-09-04 → D-10 is 2026-08-25.
    expect(compute({ wioIssued: "2026-08-20" }).selectionDue).toBe("2026-08-25");
    expect(compute({ wioIssued: null }).selectionDue).toBeNull();
  });

  it("reads Due through the end of D-10 itself", () => {
    expect(compute({ wioIssued: "2026-08-20", stageId: "s1" }).selectionState).toBe("Due");
  });

  it("escalates once D-10 has ended with no appointment recorded", () => {
    // Issued 2026-08-19 → D-10 was 2026-08-24.
    expect(compute({ wioIssued: "2026-08-19", stageId: "s1" }).selectionState).toBe("Escalated");
    expect(compute({ wioIssued: "2026-08-19", stageId: "s4" }).selectionState).toBe("Escalated");
  });

  it("says who it was escalated to, exactly as the markup names him", () => {
    expect(ALARM2_ESCALATES_TO).toBe("Hardesh sir");
    expect(SELECTION_DAY).toBe(10);
  });

  it("tells an appointment held in time from one held late", () => {
    expect(compute({ wioIssued: "2026-08-19", selectionHeld: "2026-08-24" }).selectionState).toBe("Held");
    expect(compute({ wioIssued: "2026-08-19", selectionHeld: "2026-08-25" }).selectionState).toBe("Held late");
  });

  it("does not raise the alarm on a WIO already past Finishes, and invents no date", () => {
    const r = compute({ wioIssued: "2026-08-01", stageId: "s5" });
    expect(r.selectionState).toBe("Not recorded");
    expect(r.selectionHeld).toBeNull();
  });

  it("does not apply without a WIO date or once released", () => {
    expect(compute({ wioIssued: null, stageId: "s1" }).selectionState).toBe("n/a");
    expect(compute({ wioIssued: "2026-08-01", stageId: "s1", pioReleased: "2026-08-20" }).selectionState).toBe("n/a");
  });

  it("applies at every stage if the chain has no Finishes stage, rather than at none", () => {
    const noFinishes = STAGES.filter((s) => s.stage !== "Finishes");
    const r = computeWio(wio({ wioIssued: "2026-08-01", stageId: "s10" }), noFinishes, SETTINGS, 0);
    expect(r.selectionState).toBe("Escalated");
  });

  it("never changes status, colour or priority — it records, it does not re-rank", () => {
    const silent = compute({ wioIssued: "2026-08-19", stageId: "s1", since: "2026-08-19" });
    const held = compute({ wioIssued: "2026-08-19", stageId: "s1", since: "2026-08-19", selectionHeld: "2026-08-22" });
    expect(silent.selectionState).toBe("Escalated");
    expect([silent.status, silent.tone, silent.priority]).toEqual([held.status, held.tone, held.priority]);
  });

  it("is counted on Today over running rows only", () => {
    const rows = [
      wio({ id: "a", wio: "A", wioIssued: "2026-08-19", stageId: "s1" }),
      wio({ id: "b", wio: "B", wioIssued: "2026-08-19", stageId: "s1", selectionHeld: "2026-08-23" }),
      wio({ id: "c", wio: "C", wioIssued: "2026-08-01", stageId: "s1", pioReleased: "2026-08-25" }),
      wio({ id: "d", wio: "D", wioIssued: "2026-08-01", stageId: "s8" }),
    ];
    const stats = todayStats(computeBoard(rows, STAGES, SETTINGS, new Map()), SETTINGS);
    expect(stats.escalated).toBe(1);
  });
});
