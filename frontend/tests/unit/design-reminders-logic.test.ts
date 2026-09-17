import { describe, expect, it } from "vitest";

import {
  buildReminders,
  reminderBody,
  reminderEmail,
  reminderTitle,
  type ReminderPerson,
} from "@/lib/services/design-reminders-logic";
import {
  computeProjects,
  type DesignActivity,
  type DesignPerson,
  type DesignProjectInput,
  type DesignSettings,
} from "@/lib/services/design-tracker-logic";

/**
 * The morning reminders: who hears about what. Built on the same computed
 * projects the board shows, so a reminder can never name something the board
 * does not call late.
 */

const act = (position: number, task: string, dueDay: number, dependsOn = "ID team"): DesignActivity => ({
  id: `a${position}`,
  position,
  code: String(position),
  task,
  detail: null,
  phase: null,
  dueDay,
  standardDays: null,
  dependsOn,
  dependsOnClient: false,
  optional: false,
  needsOwnPlot: false,
});

// Start 2026-09-01. Today 2026-09-17 is day 16.
const chart = [
  act(1, "Brief", 6), //       10 days late
  act(2, "Critical check", 14), // 2 days late
  act(3, "Layout", 16), //     due today
  act(4, "Layout review", 17), // due tomorrow
  act(5, "Sign-off", 30), //   not yet
];

const people: DesignPerson[] = [
  { id: "vishakha", name: "Vishakha", role: "head", title: null },
  { id: "lavika", name: "Lavika", role: "designer", title: null },
  { id: "ritu", name: "Ritu", role: "designer", title: null },
  { id: "jiya", name: "Jiya", role: "designer", title: null },
];
const reminderPeople: ReminderPerson[] = [
  { id: "vishakha", name: "Vishakha", role: "head", userId: "u-vishakha" },
  { id: "lavika", name: "Lavika", role: "designer", userId: "u-lavika" },
  { id: "ritu", name: "Ritu", role: "designer", userId: "u-ritu" },
  { id: "jiya", name: "Jiya", role: "designer", userId: null }, // no account
];

const settings: DesignSettings = { teamName: "Interior Design", warmWithin: 3, today: "2026-09-17", pinned: true };
const rules = { escalateAfter: 3, escalateAgainAfter: 7 };
const monica = { userId: "u-monica", name: "Monica" };

const project = (over: Partial<DesignProjectInput>): DesignProjectInput => ({
  id: "p",
  name: "P",
  client: null,
  location: null,
  designerId: "lavika",
  typeCode: null,
  startDate: "2026-09-01",
  completedOn: null,
  notes: null,
  activities: [],
  ...over,
});

const board = computeProjects(
  [
    project({ id: "p1", name: "Indiabulls", designerId: "lavika" }),
    // Ritu's is on time: everything up to day 17 done.
    project({
      id: "p2",
      name: "Golf Links",
      designerId: "ritu",
      activities: ["a1", "a2", "a3", "a4"].map((id) => ({ activityId: id, doneOn: "2026-09-02", notApplicable: false, remark: null })),
    }),
    project({ id: "p3", name: "Anand Lok", designerId: "jiya" }),
    project({ id: "p4", name: "No start", designerId: "lavika", startDate: null }),
    project({ id: "p5", name: "Finished", designerId: "lavika", completedOn: "2026-09-10" }),
  ],
  chart,
  people,
  settings,
);

const reminders = buildReminders(board, reminderPeople, rules, monica);
const find = (kind: string, user: string) => reminders.find((r) => r.kind === kind && r.recipientUserId === user);

describe("the designer's list", () => {
  it("is late, due today and due tomorrow — worst first — and nothing further out", () => {
    const lavika = find("designer", "u-lavika")!;
    expect(lavika.items.map((i) => [i.task, i.daysLate])).toEqual([
      ["Brief", 10],
      ["Critical check", 2],
      ["Layout", 0],
      ["Layout review", -1],
    ]);
  });

  it("leaves out projects with no start date and finished ones", () => {
    expect(find("designer", "u-lavika")!.items.every((i) => i.projectName === "Indiabulls")).toBe(true);
  });

  it("sends nothing to someone with nothing due, or with no account", () => {
    expect(find("designer", "u-ritu")).toBeUndefined();
    expect(reminders.some((r) => r.recipientName === "Jiya")).toBe(false);
  });
});

describe("escalation", () => {
  it("gives Vishakha everything late 3+ days, across designers", () => {
    const head = find("head", "u-vishakha")!;
    expect(head.items.map((i) => [i.projectName, i.task])).toEqual([
      ["Anand Lok", "Brief"],
      ["Indiabulls", "Brief"],
    ]);
  });

  it("gives the second person only what is late 7+ days", () => {
    const lead = find("leadership", "u-monica")!;
    expect(lead.items.every((i) => i.daysLate >= 7)).toBe(true);
    expect(lead.items).toHaveLength(2);
  });

  it("does not send the second escalation to the head twice over", () => {
    const same = buildReminders(board, reminderPeople, rules, { userId: "u-vishakha", name: "Vishakha" });
    expect(same.filter((r) => r.recipientUserId === "u-vishakha" && r.kind === "leadership")).toHaveLength(0);
  });

  it("sends no escalation when nothing is late enough", () => {
    const calm = buildReminders(board, reminderPeople, { escalateAfter: 30, escalateAgainAfter: 40 }, monica);
    expect(calm.filter((r) => r.kind !== "designer")).toHaveLength(0);
  });
});

describe("the words", () => {
  it("titles say the counts", () => {
    expect(reminderTitle(find("designer", "u-lavika")!, rules)).toBe("Your projects today: 2 late, 2 due today or tomorrow");
    expect(reminderTitle(find("head", "u-vishakha")!, rules)).toBe("2 activities late 3+ days, on 2 projects");
  });

  it("the bell body names the worst few and counts the rest", () => {
    expect(reminderBody(find("designer", "u-lavika")!, 2)).toBe(
      "Indiabulls — Brief, 10 days late · Indiabulls — Critical check, 2 days late · and 2 more",
    );
  });

  it("the email escapes what people typed and links to the tracker", () => {
    const r = { ...find("designer", "u-lavika")!, recipientName: "Lavika <b>" };
    const mail = reminderEmail(r, rules, "https://example.test/design-tracker");
    expect(mail.html).not.toContain("<b>");
    expect(mail.html).toContain("Lavika &lt;b&gt;");
    expect(mail.text).toContain("https://example.test/design-tracker");
  });
});
