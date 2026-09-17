import { describe, expect, it } from "vitest";
import { formatLakhs } from "@/lib/format";
import {
  ctcRefusal,
  decisionNeedsNote,
  decisionRefusal,
  defaultRoundStage,
  isoToIstLocal,
  istLocalToIso,
  lakhsToRupees,
  lengthRefusal,
  modeLabel,
  normalizeLink,
  phoneKey,
  pickQuestionSet,
  questionSetTier,
  roundHasHappened,
  rupeesToLakhs,
  scorecardSubmitRefusal,
  seatRefusal,
  seatsToFill,
  setFits,
} from "@/lib/services/hiring-logic";

/**
 * S11 · Hiring — the rules that need no database. Each block names the
 * verified finding it closes, so a regression reads as the bug it was.
 */

const SEAT = "seat-draughtsman";
const OTHER_SEAT = "seat-site-engineer";

const set = (over: Partial<Parameters<typeof pickQuestionSet>[0][number]>) => ({
  id: "x",
  name: "x",
  roleId: null,
  stageCode: null,
  isActive: true,
  createdAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const STAGES = [
  { code: "applied", label: "Applied", seq: 10, isFinal: false },
  { code: "hr_screen", label: "HR conversation", seq: 20, isFinal: false },
  { code: "department", label: "Department round", seq: 30, isFinal: false },
  { code: "hod", label: "HOD round", seq: 40, isFinal: false },
  { code: "founder", label: "Founder round", seq: 50, isFinal: false },
  { code: "offer", label: "Offer", seq: 60, isFinal: true },
];

describe("which question set an interview gets", () => {
  it("ranks seat+stage, then stage, then seat, then general", () => {
    expect(questionSetTier(set({ roleId: SEAT, stageCode: "department" }), SEAT, "department")).toBe(1);
    expect(questionSetTier(set({ stageCode: "department" }), SEAT, "department")).toBe(2);
    expect(questionSetTier(set({ roleId: SEAT }), SEAT, "department")).toBe(3);
    expect(questionSetTier(set({}), SEAT, "department")).toBe(4);
  });

  it("a seat-wide set does not replace a stage's own questions (the documented order)", () => {
    const stageSet = set({ id: "stage", stageCode: "department", createdAt: "2026-09-01T00:00:00Z" });
    const seatWide = set({ id: "seat", roleId: SEAT, createdAt: "2026-09-10T00:00:00Z" });
    expect(pickQuestionSet([seatWide, stageSet], SEAT, "department")?.id).toBe("stage");
    // …but still covers the stages nobody has written for.
    expect(pickQuestionSet([seatWide, stageSet], SEAT, "hod")?.id).toBe("seat");
  });

  it("never picks a retired set, or one written for another seat or stage", () => {
    const retired = set({ id: "retired", roleId: SEAT, stageCode: "hod", isActive: false });
    const other = set({ id: "other", roleId: OTHER_SEAT, stageCode: "hod" });
    expect(pickQuestionSet([retired, other], SEAT, "hod")).toBeNull();
    expect(setFits(retired, SEAT, "hod")).toBe(false);
    expect(setFits(other, SEAT, "hod")).toBe(false);
  });

  it("the newest set wins inside a tier, so a corrected set takes effect", () => {
    const old = set({ id: "old", roleId: SEAT, stageCode: "hod", createdAt: "2026-09-01T00:00:00Z" });
    const fixed = set({ id: "fixed", roleId: SEAT, stageCode: "hod", createdAt: "2026-09-12T00:00:00Z" });
    expect(pickQuestionSet([old, fixed], SEAT, "hod")?.id).toBe("fixed");
  });
});

describe("which interview a new round defaults to", () => {
  it("is the next conversation, never 'Applied' for a new person", () => {
    expect(defaultRoundStage(STAGES, "applied")).toBe("hr_screen");
    expect(defaultRoundStage(STAGES, "hr_screen")).toBe("department");
  });

  it("never offers the final stage — an offer is not a round", () => {
    expect(defaultRoundStage(STAGES, "founder")).toBe("founder");
    expect(defaultRoundStage(STAGES, "offer")).toBe("founder");
  });
});

describe("whether an interview has happened", () => {
  const at = "2026-09-16T06:00:00.000Z"; // 11:30 IST
  const start = new Date(at).getTime();

  it("counts one whose time has passed even if nobody marked it held", () => {
    const round = { status: "scheduled" as const, scheduledAt: at, durationMins: 45 };
    expect(roundHasHappened(round, start + 30 * 60_000)).toBe(false);
    expect(roundHasHappened(round, start + 45 * 60_000)).toBe(true);
  });

  it("counts held, and never counts called off or no-show", () => {
    expect(roundHasHappened({ status: "done", scheduledAt: at, durationMins: 45 }, start - 1)).toBe(true);
    expect(roundHasHappened({ status: "cancelled", scheduledAt: at, durationMins: 45 }, start + 1e9)).toBe(false);
    expect(roundHasHappened({ status: "no_show", scheduledAt: at, durationMins: 45 }, start + 1e9)).toBe(false);
  });

  it("refuses a write-up submitted before the interview starts, or for one that did not happen", () => {
    expect(scorecardSubmitRefusal({ status: "scheduled", scheduledAt: at }, start - 60_000)).toMatch(/has not started yet/);
    expect(scorecardSubmitRefusal({ status: "scheduled", scheduledAt: at }, start + 60_000)).toBeNull();
    expect(scorecardSubmitRefusal({ status: "cancelled", scheduledAt: at }, start + 1e9)).toMatch(/called off/);
    expect(scorecardSubmitRefusal({ status: "no_show", scheduledAt: at }, start + 1e9)).toMatch(/did not come/);
  });
});

describe("where a candidate may go from here", () => {
  it("does not flip a rejected candidate to hired", () => {
    expect(decisionRefusal("Sana", "rejected", "hired")).toMatch(/Reopen them first/);
    expect(decisionRefusal("Sana", "withdrawn", "rejected")).toMatch(/Reopen them first/);
  });

  it("refuses a decision to the status they already have", () => {
    expect(decisionRefusal("Aarti", "hired", "hired")).toMatch(/already hired/);
  });

  it("reopens only somebody who stopped", () => {
    expect(decisionRefusal("Aarti", "rejected", "active")).toBeNull();
    expect(decisionRefusal("Aarti", "hired", "active")).toBeNull();
    expect(decisionRefusal("Aarti", "active", "active")).toMatch(/already active/);
    expect(decisionRefusal("Aarti", "offered", "active")).toMatch(/nothing to reopen/);
  });

  it("makes an offer by stage, not by a second button", () => {
    expect(decisionRefusal("Aarti", "active", "offered")).toMatch(/Offer stage/);
  });

  it("wants a reason to stop somebody and to bring them back, not to hire", () => {
    expect(decisionNeedsNote("rejected")).toBe(true);
    expect(decisionNeedsNote("withdrawn")).toBe(true);
    expect(decisionNeedsNote("active")).toBe(true);
    expect(decisionNeedsNote("hired")).toBe(false);
  });
});

describe("the seat", () => {
  it("refuses a hire past headcount, and anything on a closed or filled seat", () => {
    const seat = { title: "Junior Draughtsman", status: "open" as const, headcount: 1, hired: 1 };
    expect(seatRefusal(seat, "hire")).toMatch(/is for 1 person and 1 is already hired/);
    expect(seatRefusal({ ...seat, hired: 0 }, "hire")).toBeNull();
    expect(seatRefusal({ ...seat, status: "closed", hired: 0 }, "move")).toMatch(/is closed\. Reopen/);
    expect(seatRefusal({ ...seat, status: "filled", hired: 0 }, "hire")).toMatch(/is filled/);
  });

  it("counts places still to fill, not the full headcount", () => {
    expect(
      seatsToFill([
        { status: "open", headcount: 2, hired: 1 },
        { status: "open", headcount: 1, hired: 3 },
        { status: "closed", headcount: 5, hired: 0 },
      ]),
    ).toBe(1);
  });
});

describe("what people type", () => {
  it("names the field that is too long", () => {
    expect(
      lengthRefusal([
        { label: "Phone", value: "+91 98100 12345", max: 30 },
        { label: "Where they came from", value: "x".repeat(61), max: 60 },
      ]),
    ).toBe("Where they came from is limited to 60 characters (this one is 61).");
  });

  it("catches a salary typed in the wrong unit", () => {
    expect(ctcRefusal("What they are asking", 5)).toMatch(/reads as ₹5 a year/);
    expect(ctcRefusal("What they are asking", 540_000)).toBeNull();
    expect(ctcRefusal("What they are asking", null)).toBeNull();
  });

  it("shows a salary to the precision it was entered, so the board and the edit form agree", () => {
    expect(formatLakhs(455_000)).toBe("₹4.55L");
    expect(formatLakhs(545_000)).toBe("₹5.45L");
    expect(formatLakhs(999_000)).toBe("₹9.99L");
    expect(formatLakhs(540_000)).toBe("₹5.4L");
    expect(formatLakhs(60_000)).toBe("₹60,000");
  });

  it("reads lakhs as rupees and back", () => {
    expect(lakhsToRupees("5.4")).toBe(540_000);
    expect(lakhsToRupees("")).toBeNull();
    expect(Number.isNaN(lakhsToRupees("5.4L") as number)).toBe(true);
    expect(rupeesToLakhs(540_000)).toBe("5.4");
    expect(rupeesToLakhs(null)).toBe("");
  });

  it("makes a CV link that opens, and refuses one that is not a web address", () => {
    expect(normalizeLink("drive.google.com/file/d/abc/view")).toEqual({
      ok: true,
      value: "https://drive.google.com/file/d/abc/view",
    });
    expect(normalizeLink("  ")).toEqual({ ok: true, value: null });
    expect(normalizeLink("javascript:alert(1)").ok).toBe(false);
    expect(normalizeLink("my cv").ok).toBe(false);
  });

  it("recognises the same phone however it was typed", () => {
    expect(phoneKey("+91 98110 00002")).toBe("9811000002");
    expect(phoneKey("098110-00002")).toBe("9811000002");
    expect(phoneKey("12")).toBeNull();
  });
});

describe("time, in India", () => {
  it("reads the form's time as IST whatever zone the laptop is in", () => {
    expect(istLocalToIso("2026-09-18T11:30")).toBe("2026-09-18T06:00:00.000Z");
    expect(istLocalToIso("")).toBeNull();
    expect(istLocalToIso("next tuesday")).toBeNull();
  });

  it("round-trips for the edit form", () => {
    expect(isoToIstLocal("2026-09-18T06:00:00.000Z")).toBe("2026-09-18T11:30");
    expect(isoToIstLocal(istLocalToIso("2026-12-31T23:45") as string)).toBe("2026-12-31T23:45");
  });

  it("says how an interview happens in words", () => {
    expect(modeLabel("in_person")).toBe("in person");
    expect(modeLabel("video")).toBe("video");
  });
});
