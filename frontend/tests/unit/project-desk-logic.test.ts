import { describe, expect, it } from "vitest";
import {
  addDays,
  cleanSiteWork,
  forAssistant,
  isDueThisWeek,
  isLate,
  matchesSearch,
  siteProgressPct,
  sortByDue,
  todayIST,
  type DeskProject,
} from "@/lib/services/project-desk-logic";

const base: DeskProject = {
  id: 1,
  name: "701 B Magnolias",
  client: "Mr Sharma",
  city: "Gurugram",
  type: "Apartment",
  stage: "Execution",
  owner: "Vishakha",
  next_step: "Flooring",
  due_date: "2026-09-30",
  site_work: [],
  updated_at: "2026-10-01T10:00:00+05:30",
  updated_by: "Monica",
};

describe("Project Desk rules", () => {
  it("three steps of eleven is 27%", () => {
    expect(siteProgressPct(["measurement", "civil", "electrical"])).toBe(27);
    expect(siteProgressPct([])).toBe(0);
    expect(siteProgressPct(cleanSiteWork(["x", "civil", "civil"]))).toBe(9);
  });

  it("late is a past due date on anything not handed over", () => {
    expect(isLate(base, "2026-10-01")).toBe(true);
    expect(isLate({ ...base, due_date: "2026-10-01" }, "2026-10-01")).toBe(false);
    expect(isLate({ ...base, stage: "Handover" }, "2026-10-01")).toBe(false);
    expect(isLate({ ...base, due_date: null }, "2026-10-01")).toBe(false);
  });

  it("today is India's date, not UTC's", () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India.
    expect(todayIST(new Date("2026-09-30T20:00:00Z"))).toBe("2026-10-01");
  });

  it("sorts soonest due first, undated last", () => {
    const rows = sortByDue([
      { ...base, id: 1, name: "C", due_date: null },
      { ...base, id: 2, name: "B", due_date: "2026-10-05" },
      { ...base, id: 3, name: "A", due_date: "2026-10-02" },
    ]);
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("gives the assistant site work only for projects on site", () => {
    const [onSite] = forAssistant([{ ...base, site_work: ["measurement"] }], "2026-10-01");
    expect(onSite).toMatchObject({ late: true, site_progress_pct: 9, site_work_done: ["Site measurement"] });
    const [design] = forAssistant([{ ...base, stage: "Design" }], "2026-10-01");
    expect(design).not.toHaveProperty("site_progress_pct");
  });

  it("adds days across a month and a year end", () => {
    expect(addDays("2026-10-29", 6)).toBe("2026-11-04");
    expect(addDays("2026-12-30", 2)).toBe("2027-01-01");
  });

  it("due this week is today to six days on, never late, never handed over", () => {
    const today = "2026-10-05";
    expect(isDueThisWeek({ ...base, due_date: "2026-10-05" }, today)).toBe(true);
    expect(isDueThisWeek({ ...base, due_date: "2026-10-11" }, today)).toBe(true);
    expect(isDueThisWeek({ ...base, due_date: "2026-10-12" }, today)).toBe(false);
    expect(isDueThisWeek({ ...base, due_date: "2026-10-04" }, today)).toBe(false);
    expect(isDueThisWeek({ ...base, due_date: "2026-10-06", stage: "Handover" }, today)).toBe(false);
    expect(isDueThisWeek({ ...base, due_date: null }, today)).toBe(false);
  });

  it("search needs every word, in any of name, client, city or owner", () => {
    expect(matchesSearch(base, "")).toBe(true);
    expect(matchesSearch(base, "magnolias")).toBe(true);
    expect(matchesSearch(base, "VISHAKHA gurugram")).toBe(true);
    expect(matchesSearch(base, "vishakha mumbai")).toBe(false);
    expect(matchesSearch({ ...base, client: null, owner: null }, "sharma")).toBe(false);
  });
});
