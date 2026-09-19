import { describe, expect, it } from "vitest";

import {
  activitiesSkippedByType,
  computeProject,
  computeProjects,
  forSegment,
  guessProjectType,
  heatCounts,
  holdingByDependency,
  personRows,
  refusedProjectFields,
  type DesignActivity,
  type DesignPerson,
  type DesignProjectInput,
  type DesignProjectType,
  type DesignSettings,
} from "@/lib/services/design-tracker-logic";

/**
 * The Design Activity Tracker's rules, pinned. A small chart shaped like the
 * real one — including two activities running in parallel and one that waits
 * on the client.
 */

const chart: DesignActivity[] = [
  act(1, "6", "Client brief and questionnaire", 6, "CRM"),
  act(2, "8", "Layout initiation", 29, "ID team"),
  act(3, "10", "Layout sign-off from client", 56, "CRM", true),
  act(4, "17", "On-site work initiation", 109, "CRM (client approval)", true, true),
  act(5, "18", "First cut lookbook", 93, "CRM & ID team"),
];

function act(
  position: number,
  code: string,
  task: string,
  dueDay: number | null,
  dependsOn: string,
  dependsOnClient = false,
  optional = false,
): DesignActivity {
  return {
    id: `a${position}`,
    position,
    code,
    task,
    detail: null,
    phase: null,
    dueDay,
    standardDays: null,
    dependsOn,
    dependsOnClient,
    optional,
    needsOwnPlot: false,
  };
}

const people: DesignPerson[] = [
  { id: "vishakha", name: "Vishakha", role: "head", title: "Head of Interior Design" },
  { id: "lavika", name: "Lavika", role: "designer", title: "Designer" },
  { id: "ritu", name: "Ritu", role: "designer", title: "Designer" },
];

const settings = (today: string, warmWithin = 3): DesignSettings => ({
  teamName: "Interior Design",
  warmWithin,
  today,
  pinned: true,
});

function project(over: Partial<DesignProjectInput> = {}): DesignProjectInput {
  return {
    id: "p1",
    name: "Indiabulls",
    client: "Mr Mehta",
    location: null,
    designerId: "lavika",
    typeCode: null,
    startDate: "2026-01-01",
    completedOn: null,
    notes: null,
    activities: [],
    ...over,
  };
}

const done = (activityId: string, doneOn: string) => ({ activityId, doneOn, notApplicable: false, remark: null });

describe("heat", () => {
  it("is COLD when nothing is late or close", () => {
    // Day 3: the brief is due day 6 — three days away is not within 2.
    const p = computeProject(project(), chart, people, settings("2026-01-04", 2));
    expect(p.heat).toBe("COLD");
    expect(p.day).toBe(3);
    expect(p.current?.task).toBe("Client brief and questionnaire");
  });

  it("is WARM when an activity is due within the warm window, including today", () => {
    expect(computeProject(project(), chart, people, settings("2026-01-04", 3)).heat).toBe("WARM");
    const dueToday = computeProject(project(), chart, people, settings("2026-01-07", 0));
    expect(dueToday.heat).toBe("WARM");
    expect(dueToday.dueSoon[0]?.daysToDue).toBe(0);
  });

  it("is HOT the day after the due day, with the days late and whom it depends on", () => {
    const p = computeProject(project(), chart, people, settings("2026-01-10"));
    expect(p.heat).toBe("HOT");
    expect(p.causedBy?.task).toBe("Client brief and questionnaire");
    expect(p.causedBy?.dependsOn).toBe("CRM");
    expect(p.delayDays).toBe(3);
  });

  it("names the WORST late activity as the cause, not the first in the chart", () => {
    // Brief done late-ish; layout (day 29) and sign-off (day 56) both open on day 70.
    const p = computeProject(
      project({ activities: [done("a1", "2026-01-07")] }),
      chart,
      people,
      settings("2026-03-12"),
    );
    expect(p.late.map((a) => a.code)).toEqual(["8", "10"]);
    expect(p.causedBy?.code).toBe("8");
    expect(p.delayDays).toBe(41);
  });

  it("is NOT TRACKED without a start date — never late, never guessed", () => {
    const p = computeProject(project({ startDate: null }), chart, people, settings("2026-09-16"));
    expect(p.heat).toBe("NOT TRACKED");
    expect(p.late).toHaveLength(0);
    expect(p.day).toBeNull();
  });

  it("is DONE when completed, or when every activity is done or N/A", () => {
    expect(
      computeProject(project({ completedOn: "2026-06-01" }), chart, people, settings("2026-09-16")).heat,
    ).toBe("DONE");
    const all = chart.map((a) =>
      a.optional
        ? { activityId: a.id, doneOn: null, notApplicable: true, remark: null }
        : done(a.id, "2026-01-02"),
    );
    const p = computeProject(project({ activities: all }), chart, people, settings("2026-09-16"));
    expect(p.heat).toBe("DONE");
    expect(p.doneCount).toBe(4);
    expect(p.applicableCount).toBe(4);
  });

  it("does not count an N/A activity as late", () => {
    const acts = [
      done("a1", "2026-01-06"),
      done("a2", "2026-01-29"),
      done("a3", "2026-02-25"),
      done("a5", "2026-04-03"),
      { activityId: "a4", doneOn: null, notApplicable: true, remark: null },
    ];
    const p = computeProject(project({ activities: acts }), chart, people, settings("2026-09-16"));
    expect(p.late).toHaveLength(0);
  });
});

describe("parallel activities", () => {
  it("keeps the chart's own due days — the lookbook (93) is late before on-site work (109)", () => {
    const acts = [done("a1", "2026-01-06"), done("a2", "2026-01-29"), done("a3", "2026-02-25")];
    // Day 100: lookbook due day 93 is 7 late; on-site due day 109 is 9 away.
    const p = computeProject(project({ activities: acts }), chart, people, settings("2026-04-11"));
    expect(p.heat).toBe("HOT");
    expect(p.late.map((a) => a.code)).toEqual(["18"]);
    expect(p.causedBy?.daysLate).toBe(7);
    expect(p.current?.code).toBe("17"); // first open in chart order
  });
});

describe("a done activity", () => {
  it("records how late it finished, without heating the project", () => {
    const p = computeProject(
      project({ activities: [done("a1", "2026-01-12")] }),
      chart,
      people,
      settings("2026-01-13"),
    );
    const brief = p.activities.find((a) => a.id === "a1")!;
    expect(brief.state).toBe("Done late");
    expect(brief.daysLate).toBe(5);
    expect(p.heat).toBe("COLD");
  });
});

describe("the board", () => {
  const today = settings("2026-03-12");
  const inputs = [
    project({ id: "cold", name: "Cold one", designerId: "ritu", startDate: "2026-03-10" }),
    project({ id: "hot", name: "Hot one", designerId: "lavika" }),
    project({ id: "none", name: "No start", designerId: "lavika", startDate: null }),
    project({ id: "done", name: "Done one", designerId: "ritu", completedOn: "2026-02-01" }),
  ];
  const board = computeProjects(inputs, chart, people, today);

  it("sorts hottest first, done last", () => {
    expect(board.map((p) => p.id)).toEqual(["hot", "cold", "none", "done"]);
  });

  it("counts heats over running projects only", () => {
    const c = heatCounts(board);
    expect(c).toMatchObject({ running: 3, hot: 1, cold: 1, notTracked: 1, done: 1, lateActivities: 3, clientLate: 1 });
  });

  it("gives every person a row — Vishakha's list — with the project holding them up", () => {
    const rows = personRows(board, people);
    expect(rows.map((r) => r.name)).toEqual(["Vishakha", "Lavika", "Ritu"]);
    const lavika = rows.find((r) => r.id === "lavika")!;
    expect(lavika.heat).toBe("HOT");
    expect(lavika.worst?.name).toBe("Hot one");
    expect(lavika.counts.hot).toBe(1);
    expect(rows.find((r) => r.id === "vishakha")!.counts.running).toBe(0);
  });

  it("groups late activities by whom they depend on, worst first", () => {
    const holding = holdingByDependency(board);
    // Day 70 of "Hot one": brief (day 6, CRM) 64 late + sign-off (day 56, CRM) 14 late
    // outweigh layout (day 29, ID team) at 41.
    expect(holding.map((h) => [h.dependsOn, h.lateActivities, h.totalDaysLate, h.longest])).toEqual([
      ["CRM", 2, 78, 64],
      ["ID team", 1, 41, 41],
    ]);
  });
});

describe("project types (db/051)", () => {
  const penthouse: DesignProjectType = { code: "penthouse", label: "Penthouse", segment: "residential", ownPlot: false };
  const farmhouse: DesignProjectType = { code: "farmhouse", label: "Farmhouse", segment: "residential", ownPlot: true };
  const office: DesignProjectType = { code: "office", label: "Office", segment: "commercial", ownPlot: false };
  const plotChart = chart.map((a) => (a.code === "17" ? { ...a, needsOwnPlot: true } : a));

  it("takes site construction off a project with no plot of its own", () => {
    expect(activitiesSkippedByType(penthouse, plotChart).map((a) => a.code)).toEqual(["17"]);
    expect(activitiesSkippedByType(office, plotChart).map((a) => a.code)).toEqual(["17"]);
  });

  it("keeps it for a plot — and never shortens the chart on a missing type", () => {
    expect(activitiesSkippedByType(farmhouse, plotChart)).toEqual([]);
    expect(activitiesSkippedByType(null, plotChart)).toEqual([]);
  });

  it("reads the kind from the project's own name, and says which word said so", () => {
    const types = [penthouse, farmhouse, office];
    expect(guessProjectType("Indiabulls Residence", types)).toMatchObject({
      matched: "residence",
      segment: "residential",
      type: null, // "residence" does not say apartment or kothi
    });
    expect(guessProjectType("Cyber Hub Office — fit out", types)?.type?.code).toBe("office");
    expect(guessProjectType("Sector 42 PENTHOUSE", types)?.type?.code).toBe("penthouse");
    // Longer words win: a club house is not a house.
    expect(guessProjectType("Emerald Club House", types)?.segment).toBe("commercial");
    expect(guessProjectType("Mr Bansal — Farm House", types)?.type?.code).toBe("farmhouse");
    expect(guessProjectType("Plot 14", types)).toBeNull();
    expect(guessProjectType(null, types)).toBeNull();
  });

  it("carries the type onto the project, and narrows by segment", () => {
    const board = computeProjects(
      [
        project({ id: "a", typeCode: "penthouse" }),
        project({ id: "b", typeCode: "office" }),
        project({ id: "c", typeCode: null }),
      ],
      chart,
      people,
      settings("2026-01-02"),
      [penthouse, farmhouse, office],
    );
    expect(board.find((p) => p.id === "a")?.type?.label).toBe("Penthouse");
    expect(board.find((p) => p.id === "c")?.type).toBeNull();
    expect(forSegment(board, "commercial").map((p) => p.id)).toEqual(["b"]);
    expect(forSegment(board, "residential").map((p) => p.id)).toEqual(["a"]);
    expect(forSegment(board, null)).toHaveLength(3);
  });
});

describe("who may change what about a project", () => {
  // Whether the project is theirs at all is settled against the database before
  // this is asked; these are the fields, given that it is.
  const ALL_FIELDS = [
    "name", "client", "location", "designerId", "typeCode",
    "startDate", "completedOn", "notes",
  ];

  it("lets a designer run their own project", () => {
    // Monica, 19 Sep: "log tracker me apne project edit kre". The start date is
    // the one that matters most — without it a project is off the clock and
    // invisible to the very board meant to catch it, and the designer is who
    // knows when work began.
    const mine = ALL_FIELDS.filter((f) => f !== "designerId");
    expect(refusedProjectFields("own", mine)).toEqual([]);
  });

  it("will not let a designer hand the project to somebody else", () => {
    // Not editing your own project — giving work away, or taking someone's,
    // and the person losing it would never see it coming.
    expect(refusedProjectFields("own", ["designerId"])).toEqual(["designerId"]);
    expect(refusedProjectFields("own", ["startDate", "designerId"])).toEqual(["designerId"]);
  });

  it("refuses nothing to whoever runs the board", () => {
    expect(refusedProjectFields("all", ALL_FIELDS)).toEqual([]);
  });

  it("says nothing about an empty change", () => {
    expect(refusedProjectFields("own", [])).toEqual([]);
  });
});
