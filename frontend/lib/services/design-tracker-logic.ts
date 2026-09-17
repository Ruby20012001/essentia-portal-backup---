/**
 * Design Activity Tracker — the derivation layer.
 *
 * PURE, like wio-tracker-logic.ts: no database, no clock. Everything the board
 * shows — HOT, WARM, COLD, how many days late, which activity is causing it
 * and whom that activity depends on — is computed here from a project's start
 * date, the activity chart (db/050, from "1.)DESIGN ACTIVITY CHART.xlsx") and
 * the days activities were done.
 *
 * THE CHART COUNTS FROM DAY 0. Each activity carries the day it is due by
 * ("STANDARD TIME CONSUMED"), so its due date is start + due_day. Activities
 * are not a queue: the chart runs the lookbook (day 93) while on-site work
 * runs to day 109, so any number of activities can be open at once, and a
 * project is as hot as its worst one.
 *
 * THE HEAT RULE
 *   HOT   an open activity is past its due date          — red
 *   WARM  none is late, but one is due within warmWithin  — orange
 *   COLD  nothing late, nothing close                     — blue
 * plus DONE (green) and NOT TRACKED (no start date, neutral). Red is late and
 * only late, as on the WIO board.
 *
 * Dates are 'YYYY-MM-DD' strings diffed in UTC — the same arithmetic the WIO
 * tracker uses, imported from it so the two boards can never count a day
 * differently.
 */

import { addDays, daysBetween } from "@/lib/services/wio-tracker-logic";

export type DesignActivity = {
  id: string;
  position: number;
  code: string;
  task: string;
  detail: string | null;
  phase: string | null;
  /** Day (from the project start) this activity should be done by. */
  dueDay: number | null;
  /** How many days the activity itself takes. Information, not a deadline. */
  standardDays: number | null;
  /** RESPONSIBILITY — whom the standard depends on. */
  dependsOn: string;
  dependsOnClient: boolean;
  optional: boolean;
  /** Exists only where the project has its own plot — sanctioning, site construction. */
  needsOwnPlot: boolean;
};

/**
 * What kind of project it is (db/051). `ownPlot` is what the chart uses: a
 * unit inside somebody else's building has nothing to sanction or construct.
 */
export type DesignProjectType = {
  code: string;
  label: string;
  segment: "residential" | "commercial";
  ownPlot: boolean;
};

export type DesignPerson = {
  id: string;
  name: string;
  role: "head" | "designer";
  title: string | null;
};

export type DesignSettings = {
  teamName: string;
  warmWithin: number;
  /** The date the board is read against. */
  today: string;
  /** True when somebody pinned the date in Setup; false = the calendar. */
  pinned: boolean;
};

/** One activity on one project, as stored. No row = still to do. */
export type ProjectActivityInput = {
  activityId: string;
  doneOn: string | null;
  notApplicable: boolean;
  remark: string | null;
};

export type DesignProjectInput = {
  id: string;
  name: string;
  client: string | null;
  location: string | null;
  designerId: string;
  typeCode: string | null;
  startDate: string | null;
  completedOn: string | null;
  notes: string | null;
  activities: ProjectActivityInput[];
};

export type Heat = "HOT" | "WARM" | "COLD" | "DONE" | "NOT TRACKED";

export type ActivityState =
  | "Done"
  | "Done late"
  | "N/A"
  | "HOT"
  | "WARM"
  | "COLD"
  | "No due day"
  | "Not started";

export type ComputedActivity = DesignActivity & {
  dueDate: string | null;
  doneOn: string | null;
  notApplicable: boolean;
  remark: string | null;
  state: ActivityState;
  /** Positive = days past due (open), or days it finished late (done). */
  daysLate: number | null;
  /** Days until due for an open activity; negative once late. */
  daysToDue: number | null;
};

export type ComputedProject = Omit<DesignProjectInput, "activities"> & {
  designer: string;
  /** Null when nobody has said what kind of project it is yet. */
  type: DesignProjectType | null;
  heat: Heat;
  /** Days since the start — "Day 57". Null without a start date. */
  day: number | null;
  /** The chart's last day, for "Day 57 of 238". */
  lastDay: number;
  activities: ComputedActivity[];
  /** Open activities that are late, worst first. */
  late: ComputedActivity[];
  /** Open activities due within the warm window, soonest first. */
  dueSoon: ComputedActivity[];
  /** The first open activity in chart order — where the project is. */
  current: ComputedActivity | null;
  /** The worst late activity: what is causing the delay, and on whom. */
  causedBy: ComputedActivity | null;
  delayDays: number;
  doneCount: number;
  applicableCount: number;
  priority: number;
};

const HEAT_RANK: Record<Heat, number> = {
  HOT: 4,
  WARM: 3,
  COLD: 2,
  "NOT TRACKED": 1,
  DONE: 0,
};

export function sortActivities(activities: DesignActivity[]): DesignActivity[] {
  return [...activities].sort((a, b) => a.position - b.position);
}

export function computeActivity(
  activity: DesignActivity,
  stored: ProjectActivityInput | undefined,
  startDate: string | null,
  settings: DesignSettings,
): ComputedActivity {
  const doneOn = stored?.doneOn ?? null;
  const notApplicable = stored?.notApplicable ?? false;
  const dueDate =
    startDate && activity.dueDay !== null ? addDays(startDate, activity.dueDay) : null;

  let state: ActivityState;
  let daysLate: number | null = null;
  let daysToDue: number | null = null;

  if (notApplicable) {
    state = "N/A";
  } else if (doneOn) {
    daysLate = dueDate ? daysBetween(dueDate, doneOn) : null;
    state = daysLate !== null && daysLate > 0 ? "Done late" : "Done";
  } else if (!startDate) {
    state = "Not started";
  } else if (!dueDate) {
    state = "No due day";
  } else {
    daysToDue = daysBetween(settings.today, dueDate);
    // 0 - 0 is -0 in JavaScript; a due-today activity is 0 days late, not -0.
    daysLate = 0 - daysToDue || 0;
    state = daysToDue < 0 ? "HOT" : daysToDue <= settings.warmWithin ? "WARM" : "COLD";
  }

  return {
    ...activity,
    dueDate,
    doneOn,
    notApplicable,
    remark: stored?.remark ?? null,
    state,
    daysLate,
    daysToDue,
  };
}

export function computeProject(
  project: DesignProjectInput,
  activities: DesignActivity[],
  people: DesignPerson[],
  settings: DesignSettings,
  types: DesignProjectType[] = [],
): ComputedProject {
  const byId = new Map(project.activities.map((a) => [a.activityId, a]));
  const computed = sortActivities(activities).map((a) =>
    computeActivity(a, byId.get(a.id), project.startDate, settings),
  );

  const open = computed.filter((a) => !a.doneOn && !a.notApplicable);
  const late = open
    .filter((a) => a.state === "HOT")
    .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0) || a.position - b.position);
  const dueSoon = open
    .filter((a) => a.state === "WARM")
    .sort((a, b) => (a.daysToDue ?? 0) - (b.daysToDue ?? 0) || a.position - b.position);

  // Done when somebody says so, or when there is nothing left open.
  const finished = project.completedOn !== null || (computed.length > 0 && open.length === 0);

  const heat: Heat = finished
    ? "DONE"
    : !project.startDate
      ? "NOT TRACKED"
      : late.length > 0
        ? "HOT"
        : dueSoon.length > 0
          ? "WARM"
          : "COLD";

  const causedBy = heat === "HOT" ? (late[0] ?? null) : null;
  const delayDays = causedBy?.daysLate ?? 0;
  const applicable = computed.filter((a) => !a.notApplicable);

  const day =
    project.startDate && !finished ? Math.max(0, daysBetween(project.startDate, settings.today)) : null;

  return {
    id: project.id,
    name: project.name,
    client: project.client,
    location: project.location,
    designerId: project.designerId,
    typeCode: project.typeCode,
    type: types.find((t) => t.code === project.typeCode) ?? null,
    startDate: project.startDate,
    completedOn: project.completedOn,
    notes: project.notes,
    designer: people.find((p) => p.id === project.designerId)?.name ?? "not named",
    heat,
    day,
    lastDay: Math.max(0, ...activities.map((a) => a.dueDay ?? 0)),
    activities: computed,
    late,
    dueSoon,
    current: finished ? null : (open[0] ?? null),
    causedBy,
    delayDays,
    doneCount: applicable.filter((a) => a.doneOn).length,
    applicableCount: applicable.length,
    // Heat dominates; within HOT the most days late first, and every further
    // late activity adds a little — two things late is worse than one.
    priority: HEAT_RANK[heat] * 1000 + Math.min(delayDays, 500) + late.length,
  };
}

/** Every project, hottest first. */
export function computeProjects(
  projects: DesignProjectInput[],
  activities: DesignActivity[],
  people: DesignPerson[],
  settings: DesignSettings,
  types: DesignProjectType[] = [],
): ComputedProject[] {
  return projects
    .map((p) => computeProject(p, activities, people, settings, types))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (a.dueSoon[0]?.daysToDue ?? Number.POSITIVE_INFINITY) -
          (b.dueSoon[0]?.daysToDue ?? Number.POSITIVE_INFINITY) ||
        a.name.localeCompare(b.name),
    );
}

/** Narrow to one person, or `null` for everyone. Every roll-up goes through it. */
export function forPerson<T extends { designerId: string }>(rows: T[], personId: string | null): T[] {
  return personId === null ? rows : rows.filter((r) => r.designerId === personId);
}

export type HeatCounts = {
  running: number;
  hot: number;
  warm: number;
  cold: number;
  notTracked: number;
  done: number;
  lateActivities: number;
  /** Late activities that wait on the client. */
  clientLate: number;
};

export function heatCounts(projects: ComputedProject[]): HeatCounts {
  const running = projects.filter((p) => p.heat !== "DONE");
  const late = running.flatMap((p) => p.late);
  return {
    running: running.length,
    hot: running.filter((p) => p.heat === "HOT").length,
    warm: running.filter((p) => p.heat === "WARM").length,
    cold: running.filter((p) => p.heat === "COLD").length,
    notTracked: running.filter((p) => p.heat === "NOT TRACKED").length,
    done: projects.length - running.length,
    lateActivities: late.length,
    clientLate: late.filter((a) => a.dependsOnClient).length,
  };
}

export type PersonRow = DesignPerson & {
  counts: HeatCounts;
  heat: Heat | null;
  /** The project holding this person up most — named, with its cause. */
  worst: ComputedProject | null;
};

/** One row per person: Vishakha's list. Everybody appears, with nothing or not. */
export function personRows(projects: ComputedProject[], people: DesignPerson[]): PersonRow[] {
  return people.map((person) => {
    const mine = forPerson(projects, person.id);
    const running = mine.filter((p) => p.heat !== "DONE");
    const worst = running[0] ?? null; // projects arrive hottest first
    return {
      ...person,
      counts: heatCounts(mine),
      heat: worst?.heat ?? null,
      worst,
    };
  });
}

export type DependencyRow = {
  dependsOn: string;
  lateActivities: number;
  totalDaysLate: number;
  longest: number;
  longestProject: string | null;
  projects: string[];
};

/**
 * "Who is holding what" — late activities grouped by whom they depend on,
 * the worst dependency first. This is the chart's RESPONSIBILITY column read
 * against today.
 */
export function holdingByDependency(projects: ComputedProject[]): DependencyRow[] {
  const rows = new Map<string, DependencyRow>();
  for (const p of projects) {
    if (p.heat === "DONE") continue;
    for (const a of p.late) {
      const row =
        rows.get(a.dependsOn) ??
        {
          dependsOn: a.dependsOn,
          lateActivities: 0,
          totalDaysLate: 0,
          longest: 0,
          longestProject: null,
          projects: [],
        };
      row.lateActivities += 1;
      row.totalDaysLate += a.daysLate ?? 0;
      if ((a.daysLate ?? 0) > row.longest) {
        row.longest = a.daysLate ?? 0;
        row.longestProject = p.name;
      }
      if (!row.projects.includes(p.name)) row.projects.push(p.name);
      rows.set(a.dependsOn, row);
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.totalDaysLate - a.totalDaysLate || a.dependsOn.localeCompare(b.dependsOn),
  );
}

/** The remark written on an activity the project type took off it — also how it is recognised again. */
export const NO_PLOT_REMARK = "N/A — no plot of its own for this project type.";

/**
 * The activities a project of this type does not have: those that need a plot
 * of its own, when the type has none. An unknown or missing type skips
 * nothing — the chart is never shortened on a guess.
 */
export function activitiesSkippedByType<T extends { needsOwnPlot: boolean }>(
  type: DesignProjectType | null | undefined,
  activities: T[],
): T[] {
  if (!type || type.ownPlot) return [];
  return activities.filter((a) => a.needsOwnPlot);
}

export type Segment = "residential" | "commercial";

/** Narrow to residential or commercial, or `null` for both. */
export function forSegment<T extends { type: DesignProjectType | null }>(
  rows: T[],
  segment: Segment | null,
): T[] {
  return segment === null ? rows : rows.filter((r) => r.type?.segment === segment);
}
