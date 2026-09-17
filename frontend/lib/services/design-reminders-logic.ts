/**
 * Design Activity Tracker — who is reminded of what each morning. PURE: it
 * reads computed projects (design-tracker-logic.ts) and returns messages; it
 * sends nothing. design-reminders.ts sends them.
 *
 *   designer    every late activity on their running projects, and every one
 *               due today or tomorrow
 *   head        every activity late `escalateAfter` days or more, all designers
 *   leadership  every activity late `escalateAgainAfter` days or more
 *
 * A person with nothing on their list gets no message. A reminder that says
 * "nothing today" every morning teaches people to ignore the reminder.
 */

import type { ComputedProject } from "@/lib/services/design-tracker-logic";

export type ReminderKind = "designer" | "head" | "leadership";

export type ReminderItem = {
  projectName: string;
  designer: string;
  task: string;
  dependsOn: string;
  dependsOnClient: boolean;
  dueDate: string;
  /** Positive = days late; 0 = due today; -1 = due tomorrow. */
  daysLate: number;
};

export type Reminder = {
  kind: ReminderKind;
  /** The tracker person (designer / head), or null for leadership. */
  personId: string | null;
  recipientUserId: string;
  recipientName: string;
  items: ReminderItem[];
};

export type ReminderRules = {
  escalateAfter: number;
  escalateAgainAfter: number;
};

export type ReminderPerson = {
  id: string;
  name: string;
  role: "head" | "designer";
  userId: string | null;
};

function itemsOf(p: ComputedProject, include: (daysLate: number) => boolean): ReminderItem[] {
  return p.activities
    .filter((a) => !a.doneOn && !a.notApplicable && a.dueDate && a.daysLate !== null && include(a.daysLate))
    .map((a) => ({
      projectName: p.name,
      designer: p.designer,
      task: a.task,
      dependsOn: a.dependsOn,
      dependsOnClient: a.dependsOnClient,
      dueDate: a.dueDate!,
      daysLate: a.daysLate!,
    }));
}

/** Latest first: the most late at the top, then today, then tomorrow. */
function byLateness(a: ReminderItem, b: ReminderItem): number {
  return b.daysLate - a.daysLate || a.projectName.localeCompare(b.projectName) || a.task.localeCompare(b.task);
}

export function buildReminders(
  projects: ComputedProject[],
  people: ReminderPerson[],
  rules: ReminderRules,
  leadership: { userId: string; name: string } | null,
): Reminder[] {
  const running = projects.filter((p) => p.heat !== "DONE" && p.startDate);
  const out: Reminder[] = [];

  // Designers — and the head, for projects that are her own.
  for (const person of people) {
    if (!person.userId) continue;
    const items = running
      .filter((p) => p.designerId === person.id)
      // late (>0), due today (0) or due tomorrow (-1)
      .flatMap((p) => itemsOf(p, (d) => d >= -1))
      .sort(byLateness);
    if (items.length > 0) {
      out.push({ kind: "designer", personId: person.id, recipientUserId: person.userId, recipientName: person.name, items });
    }
  }

  const head = people.find((p) => p.role === "head" && p.userId);
  if (head) {
    const items = running.flatMap((p) => itemsOf(p, (d) => d >= rules.escalateAfter)).sort(byLateness);
    if (items.length > 0) {
      out.push({ kind: "head", personId: head.id, recipientUserId: head.userId!, recipientName: head.name, items });
    }
  }

  if (leadership && leadership.userId !== head?.userId) {
    const items = running.flatMap((p) => itemsOf(p, (d) => d >= rules.escalateAgainAfter)).sort(byLateness);
    if (items.length > 0) {
      out.push({ kind: "leadership", personId: null, recipientUserId: leadership.userId, recipientName: leadership.name, items });
    }
  }

  return out;
}

export function whenText(item: ReminderItem): string {
  if (item.daysLate > 0) return `${item.daysLate} day${item.daysLate === 1 ? "" : "s"} late`;
  if (item.daysLate === 0) return "due today";
  return "due tomorrow";
}

export function reminderTitle(r: Reminder, rules: ReminderRules): string {
  const late = r.items.filter((i) => i.daysLate > 0).length;
  const soon = r.items.length - late;
  const projects = new Set(r.items.map((i) => i.projectName)).size;
  if (r.kind === "designer") {
    const parts = [late > 0 ? `${late} late` : null, soon > 0 ? `${soon} due today or tomorrow` : null].filter(Boolean);
    return `Your projects today: ${parts.join(", ")}`;
  }
  const days = r.kind === "head" ? rules.escalateAfter : rules.escalateAgainAfter;
  return `${r.items.length} ${r.items.length === 1 ? "activity" : "activities"} late ${days}+ days, on ${projects} ${projects === 1 ? "project" : "projects"}`;
}

/** Short, for the bell: the worst few, one line each. */
export function reminderBody(r: Reminder, max = 4): string {
  const lines = r.items
    .slice(0, max)
    .map((i) => `${i.projectName}${r.kind === "designer" ? "" : ` (${i.designer})`} — ${i.task}, ${whenText(i)}`);
  const more = r.items.length > max ? ` · and ${r.items.length - max} more` : "";
  return lines.join(" · ") + more;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The whole list, grouped — by project for a designer, by designer for escalations. */
export function reminderEmail(
  r: Reminder,
  rules: ReminderRules,
  link: string,
): { subject: string; text: string; html: string } {
  const subject = reminderTitle(r, rules);
  const groupKey = (i: ReminderItem) => (r.kind === "designer" ? i.projectName : i.designer);
  const groups = new Map<string, ReminderItem[]>();
  for (const i of r.items) groups.set(groupKey(i), [...(groups.get(groupKey(i)) ?? []), i]);

  const intro =
    r.kind === "designer"
      ? `Good morning ${r.recipientName}. This is what needs you today on your projects.`
      : r.kind === "head"
        ? `Good morning ${r.recipientName}. These activities are ${rules.escalateAfter} or more days late.`
        : `Good morning ${r.recipientName}. These design activities are ${rules.escalateAgainAfter} or more days late.`;

  const text = [
    intro,
    "",
    ...[...groups.entries()].flatMap(([g, items]) => [
      g,
      ...items.map(
        (i) =>
          `  - ${r.kind === "designer" ? "" : `${i.projectName}: `}${i.task} — ${whenText(i)} (due ${i.dueDate}), depends on ${i.dependsOn}${i.dependsOnClient ? " · client" : ""}`,
      ),
      "",
    ]),
    `Open the tracker: ${link}`,
    "",
    "Finished something? Press ✓ Done on its card in the ✓ Update tab.",
  ].join("\n");

  const colour = (i: ReminderItem) => (i.daysLate > 0 ? "#B3261E" : "#B7791F");
  const html = `<!doctype html><html><body style="margin:0;background:#F4F2F0;font-family:Lato,Arial,sans-serif;color:#1C1714">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden">
<tr><td style="background:#1C1714;padding:14px 24px;color:#F4F2F0;font-size:14px;letter-spacing:1px">essentia · Design Activity Tracker</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 8px;font-family:Georgia,serif;font-size:20px">${escapeHtml(subject)}</h1>
<p style="margin:0 0 16px;font-size:14px;color:#4b463f">${escapeHtml(intro)}</p>
${[...groups.entries()]
  .map(
    ([g, items]) => `<p style="margin:16px 0 6px;font-size:13px;font-weight:700">${escapeHtml(g)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px">${items
      .map(
        (i) => `<tr><td style="padding:6px 0;border-top:1px solid #eee">
<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colour(i)};margin-right:6px"></span>
${r.kind === "designer" ? "" : `${escapeHtml(i.projectName)} — `}${escapeHtml(i.task)}
<br><span style="color:#7a736b;font-size:12px">${escapeHtml(whenText(i))} · due ${i.dueDate} · depends on ${escapeHtml(i.dependsOn)}${i.dependsOnClient ? " · client" : ""}</span>
</td></tr>`,
      )
      .join("")}</table>`,
  )
  .join("")}
<p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#1C1714;color:#F4F2F0;text-decoration:none;padding:10px 20px;border-radius:4px;font-weight:700;font-size:13px">Open the tracker</a></p>
<p style="margin:12px 0 0;font-size:12px;color:#7a736b">Finished something? Press ✓ Done on its card in the ✓ Update tab.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject, text, html };
}
