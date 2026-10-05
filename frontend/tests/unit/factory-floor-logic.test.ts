import { describe, expect, it } from "vitest";
import {
  assignmentState,
  breachRuns,
  daysLeft,
  forecastDays,
  sortQueue,
  type Assignment,
} from "@/lib/services/factory-floor-logic";

const today = "2026-10-05";

const a = (over: Partial<Assignment>): Assignment => ({
  id: "a",
  pioNumber: "ED/26-27/041",
  project: "Test project",
  station: "Carpentry",
  scope: null,
  status: "in_production",
  target: "2026-10-20",
  done: false,
  ...over,
});

describe("NH8 production rules", () => {
  it("days left goes negative once the target has passed", () => {
    expect(daysLeft("2026-10-13", today)).toBe(8);
    expect(daysLeft("2026-10-02", today)).toBe(-3);
  });

  it("overdue wins over queued; complete wins over everything", () => {
    expect(assignmentState(a({}), today)).toBe("In production");
    expect(assignmentState(a({ status: "queued" }), today)).toBe("Queued");
    expect(assignmentState(a({ status: "queued", target: "2026-10-01" }), today)).toBe("Overdue");
    expect(assignmentState(a({ done: true, target: "2026-10-01" }), today)).toBe("Complete");
  });

  it("queue drops finished work and puts the most late first", () => {
    const rows = sortQueue(
      [
        a({ pioNumber: "B", target: "2026-10-26" }),
        a({ pioNumber: "A", target: "2026-10-02" }),
        a({ pioNumber: "C", target: "2026-10-13" }),
        a({ pioNumber: "D", done: true }),
      ],
      today,
    );
    expect(rows.map((r) => r.pioNumber)).toEqual(["A", "C", "B"]);
  });

  it("forecast adds stations together and only breaches with a manpower figure", () => {
    const days = forecastDays(
      [
        { date: "2026-10-08", arriving: 2, manpower: 2 },
        { date: "2026-10-08", arriving: 2, manpower: 1 },
        { date: "2026-10-09", arriving: 4, manpower: null },
      ],
      today,
    );
    expect(days).toHaveLength(14);
    expect(days[0]).toMatchObject({ n: 1, date: today, forecast: false, breach: false });
    expect(days[3]).toMatchObject({ n: 4, arriving: 4, capacity: 3, breach: true });
    expect(days[4]).toMatchObject({ n: 5, arriving: 4, capacity: null, forecast: true, breach: false });
  });

  it("names breach days as runs", () => {
    const days = forecastDays(
      ["2026-10-08", "2026-10-09", "2026-10-13"].map((date) => ({ date, arriving: 4, manpower: 3 })),
      today,
    );
    expect(breachRuns(days)).toEqual(["Days 4–5", "Day 9"]);
    expect(breachRuns(forecastDays([], today))).toEqual([]);
  });
});
