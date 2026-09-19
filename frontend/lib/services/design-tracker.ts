import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { PermissionError } from "@/lib/services/permissions";
import { BlockingRuleError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";
import { addDays, toDayString } from "@/lib/services/wio-tracker-logic";
import {
  activitiesSkippedByType,
  computeProjects,
  NO_PLOT_REMARK,
  heatCounts,
  holdingByDependency,
  personRows,
  refusedProjectFields,
  type ComputedProject,
  type DependencyRow,
  type DesignActivity,
  type DesignPerson,
  type DesignProjectInput,
  type DesignProjectType,
  type DesignSettings,
  type HeatCounts,
  type PersonRow,
} from "@/lib/services/design-tracker-logic";

/**
 * Design Activity Tracker — data access. Reads and writes; derives nothing
 * (see design-tracker-logic.ts).
 *
 * ACCESS is by name, from ee.design_tracker_people (db/050), the way the decks
 * use their editors list:
 *   L0 / L1 (Monica, Hardesh)   everybody — read, add, change, Setup
 *   the head (Vishakha)         everybody — read, add, change, Setup
 *   a designer                  their own projects — read, tick activities,
 *                               notes. The list of names shows only them.
 *   anybody else signed in      nothing, said in a sentence
 *
 * Filtering for a designer happens HERE, on the server, not in the page: a
 * designer's browser never receives somebody else's projects.
 */

export type DesignViewer = {
  scope: "all" | "own";
  personId: string | null;
  name: string;
  isHead: boolean;
};

export type DesignBoard = {
  settings: DesignSettings;
  activities: DesignActivity[];
  people: DesignPerson[];
  /** Residential and commercial project types (db/051), in list order. */
  types: DesignProjectType[];
  projects: ComputedProject[];
  counts: HeatCounts;
  team: PersonRow[];
  holding: DependencyRow[];
  viewer: DesignViewer;
  /** manage = add/delete projects, retune the chart, Setup. edit = tick activities. */
  can: { manage: boolean; edit: boolean; export: boolean };
  /** Who did what, newest first. Only for whoever runs the board. */
  activity: DesignActivityEntry[];
};

/** One thing somebody did to the board, said in a line. */
export type DesignActivityEntry = {
  id: string;
  at: string;
  who: string;
  /** Already worded for a reader — see sayAudit. */
  what: string;
  project: string | null;
};

class DesignAccessError extends PermissionError {
  constructor(user: SessionUser, message: string) {
    super(user, "read", "design_tracker");
    this.message = message;
  }
}

/** Today in India. The board is read in Gurugram; UTC is a day behind until 5:30. */
function indiaToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

async function resolveViewer(user: SessionUser): Promise<DesignViewer> {
  const [person] = await query<{ id: string; name: string; role: "head" | "designer" }>(
    `SELECT id, name, role FROM ee.design_tracker_people
      WHERE user_id = $1 AND is_active LIMIT 1`,
    [user.id],
  );
  if (user.accessLevel === "L0" || user.accessLevel === "L1") {
    return {
      scope: "all",
      personId: person?.id ?? null,
      name: person?.name ?? user.name,
      isHead: person?.role === "head",
    };
  }
  if (!person) {
    throw new DesignAccessError(
      user,
      "The Design Activity Tracker is held by the interior design team — Vishakha and her designers. Ask Vishakha to add you.",
    );
  }
  return {
    scope: person.role === "head" ? "all" : "own",
    personId: person.id,
    name: person.name,
    isHead: person.role === "head",
  };
}

/**
 * Does this person run the design board — the head, or an admin?
 *
 * The same rule as the board's own `can.manage`, but as a plain boolean that
 * never throws. resolveViewer() refuses somebody who is not on the design team
 * with an error, which is right inside the tracker and wrong for the shell:
 * the shell asks this on every page render, including for people who have
 * nothing to do with design, and an exception there would take the whole page
 * down rather than hide a link.
 *
 * Fails closed. A database blip hides the link rather than showing it to
 * somebody it was deliberately taken away from.
 */
export async function isDesignManager(user: SessionUser | null): Promise<boolean> {
  if (!user?.id) return false;
  if (user.accessLevel === "L0" || user.accessLevel === "L1") return true;
  try {
    const rows = await query<{ one: number }>(
      `SELECT 1 AS one FROM ee.design_tracker_people
        WHERE user_id = $1 AND is_active AND role = 'head' LIMIT 1`,
      [user.id],
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function requireManager(user: SessionUser): Promise<DesignViewer> {
  const viewer = await resolveViewer(user);
  if (viewer.scope !== "all") {
    throw new DesignAccessError(
      user,
      "Only Vishakha (or Monica / Hardesh sir) can add, remove or retune — you can tick activities and write notes on your own projects.",
    );
  }
  return viewer;
}

/** Manager, or the designer the project belongs to. */
async function requireProjectEditor(user: SessionUser, projectId: string): Promise<DesignViewer> {
  const viewer = await resolveViewer(user);
  const [project] = await query<{ designer_id: string }>(
    `SELECT designer_id FROM ee.design_projects WHERE id = $1`,
    [projectId],
  );
  if (!project) throw new NotFoundError("That project is not on the board.");
  if (viewer.scope === "own" && project.designer_id !== viewer.personId) {
    throw new DesignAccessError(user, "That project belongs to another designer.");
  }
  return viewer;
}

/**
 * Recording work is the designer's, not the head's (Monica, 19 Sep: "Vishakha
 * sirf track kregi, lekin wo changes krenge apne apne tracker me").
 *
 * She reads what they have done; she does not tick it off for them. A board
 * where the head can also mark work done is a board whose numbers no longer
 * say who did what — the whole point of the trail on her dashboard.
 *
 * Monica and Hardesh sir keep it, because somebody has to be able to correct a
 * mistake when the person who made it is not there.
 *
 * Deliberately NOT extended to adding projects, the chart or the reminders.
 * Those are how the board exists at all — take them from her too and no
 * project could ever be put on it. Setting the board up is not the same act as
 * working on it.
 */
async function requireWorkRecorder(user: SessionUser, projectId: string): Promise<DesignViewer> {
  const viewer = await requireProjectEditor(user, projectId);
  const isAdmin = user.accessLevel === "L0" || user.accessLevel === "L1";
  if (viewer.isHead && !isAdmin) {
    throw new DesignAccessError(
      user,
      "Ticking work off is the designer's — this board is for reading what they have done. Ask them to mark it, or ask Monica if it has to be corrected here.",
    );
  }
  return viewer;
}

/** May this viewer record work — tick activities, mark N/A, write remarks? */
function mayRecordWork(user: SessionUser, viewer: DesignViewer): boolean {
  if (user.accessLevel === "L0" || user.accessLevel === "L1") return true;
  return !viewer.isHead;
}

export async function getDesignSettings(): Promise<DesignSettings> {
  const [row] = await query<{
    team_name: string;
    warm_within: number;
    today_stamp: string | null;
  }>(
    `SELECT team_name, warm_within, today_stamp::text AS today_stamp
       FROM ee.design_tracker_settings WHERE id = 1`,
  );
  if (!row) {
    throw new NotFoundError(
      "The design tracker has no settings row — db/050 has not been loaded into this database.",
    );
  }
  const stamp = toDayString(row.today_stamp);
  return {
    teamName: row.team_name,
    warmWithin: Number(row.warm_within),
    today: stamp ?? indiaToday(),
    pinned: stamp !== null,
  };
}

async function listActivities(): Promise<DesignActivity[]> {
  const rows = await query<{
    id: string;
    position: number;
    code: string;
    task: string;
    detail: string | null;
    phase: string | null;
    due_day: number | null;
    standard_days: number | null;
    depends_on: string | null;
    depends_on_client: boolean;
    optional: boolean;
    needs_own_plot: boolean;
  }>(
    `SELECT id, position, code, task, detail, phase, due_day, standard_days,
            depends_on, depends_on_client, optional, needs_own_plot
       FROM ee.design_activities ORDER BY position`,
  );
  return rows.map((r) => ({
    id: r.id,
    position: Number(r.position),
    code: r.code,
    task: r.task,
    detail: r.detail,
    phase: r.phase,
    dueDay: r.due_day === null ? null : Number(r.due_day),
    standardDays: r.standard_days === null ? null : Number(r.standard_days),
    dependsOn: r.depends_on?.trim() || "not named in the chart",
    dependsOnClient: r.depends_on_client,
    optional: r.optional,
    needsOwnPlot: r.needs_own_plot,
  }));
}

async function listTypes(): Promise<DesignProjectType[]> {
  const rows = await query<{
    code: string;
    label: string;
    segment: "residential" | "commercial";
    own_plot: boolean;
  }>(
    `SELECT code, label, segment, own_plot FROM ee.design_project_types
      WHERE is_active ORDER BY sort_order, label`,
  );
  return rows.map((r) => ({ code: r.code, label: r.label, segment: r.segment, ownPlot: r.own_plot }));
}

async function listPeople(): Promise<DesignPerson[]> {
  const rows = await query<{
    id: string;
    name: string;
    role: "head" | "designer";
    title: string | null;
  }>(
    `SELECT id, name, role, title FROM ee.design_tracker_people
      WHERE is_active ORDER BY sort_order, name`,
  );
  return rows;
}

async function listProjectInputs(designerId: string | null): Promise<DesignProjectInput[]> {
  const projects = await query<{
    id: string;
    name: string;
    client: string | null;
    location: string | null;
    designer_id: string;
    type_code: string | null;
    start_date: string | null;
    completed_on: string | null;
    notes: string | null;
  }>(
    `SELECT id, name, client, location, designer_id, type_code,
            start_date::text AS start_date, completed_on::text AS completed_on, notes
       FROM ee.design_projects
      WHERE ($1::uuid IS NULL OR designer_id = $1::uuid)`,
    [designerId],
  );
  if (projects.length === 0) return [];

  const marks = await query<{
    project_id: string;
    activity_id: string;
    done_on: string | null;
    not_applicable: boolean;
    remark: string | null;
  }>(
    `SELECT project_id, activity_id, done_on::text AS done_on, not_applicable, remark
       FROM ee.design_project_activities
      WHERE project_id = ANY($1::uuid[])`,
    [projects.map((p) => p.id)],
  );

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    client: p.client,
    location: p.location,
    designerId: p.designer_id,
    typeCode: p.type_code,
    startDate: toDayString(p.start_date),
    completedOn: toDayString(p.completed_on),
    notes: p.notes,
    activities: marks
      .filter((m) => m.project_id === p.id)
      .map((m) => ({
        activityId: m.activity_id,
        doneOn: toDayString(m.done_on),
        notApplicable: m.not_applicable,
        remark: m.remark,
      })),
  }));
}

/**
 * Every project, computed, with nobody's lens on it — for the morning
 * reminders, which run with no one signed in. Asks no permission: callers
 * decide who may trigger it (the cron secret, or a manager).
 */
export async function loadWholeDesignBoard(): Promise<{
  settings: DesignSettings;
  activities: DesignActivity[];
  people: DesignPerson[];
  projects: ComputedProject[];
}> {
  const [settings, activities, people, types, inputs] = await Promise.all([
    getDesignSettings(),
    listActivities(),
    listPeople(),
    listTypes(),
    listProjectInputs(null),
  ]);
  return {
    settings,
    activities,
    people,
    projects: computeProjects(inputs, activities, people, settings, types),
  };
}

/**
 * Who did what on the board — read back out of audit.log.
 *
 * Nothing new is recorded for this: every route through this file already
 * writes an audit row naming the person, the action and what changed. The
 * trail was simply never read back, so Vishakha could see that a project had
 * moved but not who moved it (Monica, 19 Sep: "jo bhi project edit krenge ya
 * kaam krenge, wo Vishakha mam k dashboard pr activity show hogi").
 *
 * Manager only, and it fails quiet: a dashboard that will not load because the
 * history could not be read is worse than a dashboard with no history on it.
 */
const AUDIT_WORDS: Record<string, string> = {
  DESIGN_PROJECT_CREATED: "added the project",
  DESIGN_PROJECT_UPDATED: "changed the project",
  DESIGN_PROJECT_DELETED: "removed the project",
  DESIGN_ACTIVITY_MARKED: "ticked off a task",
  DESIGN_ACTIVITIES_MARKED: "ticked off several tasks",
  DESIGN_CHART_RETUNED: "retuned the activity chart",
  DESIGN_TRACKER_SETTINGS_UPDATED: "changed the board's settings",
};

async function listDesignActivity(limit = 30): Promise<DesignActivityEntry[]> {
  try {
    const rows = await query<{
      id: string;
      created_at: string;
      action: string;
      who: string | null;
      new_values: Record<string, unknown> | null;
    }>(
      `SELECT l.id, l.created_at, l.action, u.full_name AS who, l.new_values
         FROM audit.log l
         LEFT JOIN public.users u ON u.id = l.user_id
        WHERE l.resource_type = 'design_tracker'
        ORDER BY l.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((r) => {
      const v = r.new_values ?? {};
      const named = typeof v.name === "string" ? v.name : null;
      return {
        id: r.id,
        at: r.created_at,
        who: r.who ?? "somebody",
        what: AUDIT_WORDS[r.action] ?? r.action.toLowerCase().replace(/_/g, " "),
        project: named,
      };
    });
  } catch (error) {
    console.error("design tracker: the activity trail could not be read", error);
    return [];
  }
}

/** Manager check for routes outside this file (the reminders screen). */
export async function requireDesignManager(user: SessionUser): Promise<void> {
  await requireManager(user);
}

export async function getDesignBoard(user: SessionUser): Promise<DesignBoard> {
  const viewer = await resolveViewer(user);

  const [settings, activities, allPeople, types, inputs, activity] = await Promise.all([
    getDesignSettings(),
    listActivities(),
    listPeople(),
    listTypes(),
    listProjectInputs(viewer.scope === "own" ? viewer.personId : null),
    /* Only the head is shown the trail, and only the head's page pays for the
       query — a designer's board does not ask for it at all. */
    viewer.scope === "all" ? listDesignActivity() : Promise.resolve([]),
  ]);

  const people =
    viewer.scope === "own" ? allPeople.filter((p) => p.id === viewer.personId) : allPeople;
  const projects = computeProjects(inputs, activities, allPeople, settings, types);

  return {
    settings,
    activities,
    people,
    types,
    projects,
    counts: heatCounts(projects),
    team: personRows(projects, people),
    holding: holdingByDependency(projects),
    viewer,
    can: { manage: viewer.scope === "all", edit: mayRecordWork(user, viewer), export: true },
    activity,
  };
}

// ── projects ────────────────────────────────────────────────────────

export type CreateProjectInput = {
  name: string;
  client?: string | null;
  location?: string | null;
  designerId: string;
  /** Apartment, kothi, office… (db/051). Optional, but it shapes the chart. */
  typeCode?: string | null;
  startDate?: string | null;
  notes?: string | null;
  /**
   * For a project already under way: every activity up to and including this
   * chart position is recorded done, on its due date (or today, if that is
   * earlier), with a remark saying so. Otherwise a project that started four
   * months ago arrives with twenty activities late.
   */
  doneThroughPosition?: number | null;
};

export async function createDesignProject(
  user: SessionUser,
  input: CreateProjectInput,
): Promise<string> {
  await requireManager(user);
  const settings = await getDesignSettings();

  const name = input.name.trim();
  if (!name) throw new BlockingRuleError("A project name is required — that is how the board is read.");
  if (input.doneThroughPosition && !input.startDate) {
    throw new BlockingRuleError(
      "Add the start date first — activities marked done are dated from it.",
    );
  }

  const id = await withTransaction(async (q) => {
    const [person] = await q<{ id: string }>(
      `SELECT id FROM ee.design_tracker_people WHERE id = $1 AND is_active`,
      [input.designerId],
    );
    if (!person) {
      throw new BlockingRuleError("Pick whose project this is — every project on the board has a designer.");
    }

    const [existing] = await q<{ id: string }>(
      `SELECT id FROM ee.design_projects WHERE lower(name) = lower($1) AND completed_on IS NULL`,
      [name],
    );
    if (existing) {
      throw new BlockingRuleError(`${name} is already on the board. Open it rather than adding a second row.`);
    }

    const type = input.typeCode ? await findType(q, input.typeCode) : null;

    const [row] = await q<{ id: string }>(
      `INSERT INTO ee.design_projects
         (name, client, location, designer_id, type_code, start_date, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)
       RETURNING id`,
      [
        name,
        input.client ?? null,
        input.location ?? null,
        input.designerId,
        type?.code ?? null,
        input.startDate ?? null,
        input.notes ?? null,
        user.id,
      ],
    );

    if (input.doneThroughPosition && input.startDate) {
      const earlier = await q<{ id: string; due_day: number | null }>(
        `SELECT id, due_day FROM ee.design_activities WHERE position <= $1`,
        [input.doneThroughPosition],
      );
      for (const a of earlier) {
        const due = a.due_day === null ? settings.today : addDays(input.startDate, Number(a.due_day));
        await q(
          `INSERT INTO ee.design_project_activities
             (project_id, activity_id, done_on, remark, updated_by)
           VALUES ($1, $2, $3::date, $4, $5)`,
          [
            row!.id,
            a.id,
            due < settings.today ? due : settings.today,
            "Recorded done when the project was added to the board.",
            user.id,
          ],
        );
      }
    }
    // After "done up to", so an activity already recorded done stays done.
    await applyTypeToChart(q, row!.id, type, user.id);
    return row!.id;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_PROJECT_CREATED",
    resourceType: "design_tracker",
    resourceId: id,
    newValues: input,
  });
  return id;
}

type Q = typeof query;

async function findType(q: Q, code: string): Promise<DesignProjectType> {
  const [t] = await q<{ code: string; label: string; segment: "residential" | "commercial"; own_plot: boolean }>(
    `SELECT code, label, segment, own_plot FROM ee.design_project_types WHERE code = $1 AND is_active`,
    [code],
  );
  if (!t) throw new BlockingRuleError("That is not one of the project types. Pick one from the list.");
  return { code: t.code, label: t.label, segment: t.segment, ownPlot: t.own_plot };
}

/**
 * Make the plot-only activities (sanctioning, site construction) agree with
 * the project's type. No plot: each is marked N/A with NO_PLOT_REMARK, unless
 * somebody already recorded it done or wrote their own remark on it. A plot,
 * or no type: only the N/A marks this function wrote are lifted — a person's
 * own N/A is theirs and stays.
 */
async function applyTypeToChart(
  q: Q,
  projectId: string,
  type: DesignProjectType | null,
  userId: string,
): Promise<void> {
  const plotOnly = await q<{ id: string; needs_own_plot: boolean }>(
    `SELECT id, needs_own_plot FROM ee.design_activities WHERE needs_own_plot`,
  );
  if (plotOnly.length === 0) return;

  const skip = activitiesSkippedByType(
    type,
    plotOnly.map((r) => ({ id: r.id, needsOwnPlot: r.needs_own_plot })),
  ).map((a) => a.id);

  if (skip.length > 0) {
    await q(
      `INSERT INTO ee.design_project_activities (project_id, activity_id, not_applicable, remark, updated_by)
       SELECT $1, a, TRUE, $2, $3 FROM unnest($4::uuid[]) AS a
       ON CONFLICT (project_id, activity_id) DO UPDATE SET
         not_applicable = TRUE, remark = EXCLUDED.remark,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()
       WHERE ee.design_project_activities.done_on IS NULL
         AND (ee.design_project_activities.remark IS NULL
              OR ee.design_project_activities.remark = EXCLUDED.remark)`,
      [projectId, NO_PLOT_REMARK, userId, skip],
    );
  }

  const keep = plotOnly.map((r) => r.id).filter((id) => !skip.includes(id));
  if (keep.length > 0) {
    await q(
      `DELETE FROM ee.design_project_activities
        WHERE project_id = $1 AND activity_id = ANY($2::uuid[])
          AND not_applicable AND done_on IS NULL AND remark = $3`,
      [projectId, keep, NO_PLOT_REMARK],
    );
  }
}

export type ProjectPatch = Partial<{
  typeCode: string | null;
  name: string;
  client: string | null;
  location: string | null;
  designerId: string;
  startDate: string | null;
  completedOn: string | null;
  notes: string | null;
}>;

export async function updateDesignProject(
  user: SessionUser,
  id: string,
  patch: ProjectPatch,
): Promise<void> {
  const viewer = await requireProjectEditor(user, id);

  /* A designer runs their own project (Monica, 19 Sep: "log tracker me apne
     project edit kre"). requireProjectEditor above has already refused anybody
     reaching for a project that is not theirs, so what is left to decide is
     which fields, not whose.

     Everything is theirs except WHO IT BELONGS TO. The start date, the type,
     the client, when it finished — these are facts the designer holds first
     and Vishakha learns from them; making her the only one who could enter
     them is what left projects sitting with no start date, off the clock and
     invisible to the very board meant to catch them.

     designerId stays hers. Changing that is not editing your own project, it
     is handing work to somebody else or taking theirs — a different act, and
     one the person losing the project would never see coming.

     None of this is quiet: every change here writes an audit row, and those
     are read back onto Vishakha's dashboard. */
  const refused = refusedProjectFields(viewer.scope, Object.keys(patch));
  if (refused.length > 0) {
    throw new DesignAccessError(
      user,
      "Only Vishakha can move a project to a different designer. Everything else about your own project is yours to change.",
    );
  }

  if (patch.name !== undefined && !patch.name.trim()) {
    throw new BlockingRuleError("A project needs a name.");
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown, cast = "") => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };

  if (patch.designerId !== undefined) {
    const [person] = await query<{ id: string }>(
      `SELECT id FROM ee.design_tracker_people WHERE id = $1 AND is_active`,
      [patch.designerId],
    );
    if (!person) throw new BlockingRuleError("That is not one of the designers on the board.");
    set("designer_id", patch.designerId);
  }
  if (patch.name !== undefined) set("name", patch.name.trim());
  if (patch.client !== undefined) set("client", patch.client);
  if (patch.location !== undefined) set("location", patch.location);
  if (patch.startDate !== undefined) set("start_date", patch.startDate, "::date");
  if (patch.completedOn !== undefined) set("completed_on", patch.completedOn, "::date");
  if (patch.notes !== undefined) set("notes", patch.notes);

  if (patch.typeCode !== undefined) set("type_code", patch.typeCode);
  if (sets.length === 0) throw new BlockingRuleError("Nothing to change — the patch was empty.");

  values.push(id);
  await withTransaction(async (q) => {
    const type = patch.typeCode ? await findType(q, patch.typeCode) : null;
    const updated = await q<{ id: string }>(
      `UPDATE ee.design_projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${values.length} RETURNING id`,
      values,
    );
    if (updated.length === 0) throw new NotFoundError("That project is not on the board.");
    if (patch.typeCode !== undefined) await applyTypeToChart(q, id, type, user.id);
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_PROJECT_UPDATED",
    resourceType: "design_tracker",
    resourceId: id,
    newValues: patch,
  });
}

export async function deleteDesignProject(user: SessionUser, id: string): Promise<void> {
  await requireManager(user);
  const [row] = await query<{ name: string }>(
    `DELETE FROM ee.design_projects WHERE id = $1 RETURNING name`,
    [id],
  );
  if (!row) throw new NotFoundError("That project is not on the board.");
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_PROJECT_DELETED",
    resourceType: "design_tracker",
    resourceId: id,
    oldValues: { name: row.name },
  });
}

export type ActivityMark = Partial<{
  doneOn: string | null;
  notApplicable: boolean;
  remark: string | null;
}>;

/** Tick, untick, mark N/A or remark one activity on one project. */
export async function markProjectActivity(
  user: SessionUser,
  projectId: string,
  activityId: string,
  mark: ActivityMark,
): Promise<void> {
  await requireWorkRecorder(user, projectId);
  const settings = await getDesignSettings();

  if (mark.doneOn && mark.doneOn > settings.today) {
    throw new BlockingRuleError(
      `${mark.doneOn} is after today (${settings.today}). Record an activity done on the day it was done.`,
    );
  }

  await withTransaction(async (q) => {
    const [activity] = await q<{ id: string }>(
      `SELECT id FROM ee.design_activities WHERE id = $1`,
      [activityId],
    );
    if (!activity) throw new NotFoundError("That activity is not in the chart.");

    const [project] = await q<{ start_date: string | null }>(
      `SELECT start_date::text AS start_date FROM ee.design_projects WHERE id = $1`,
      [projectId],
    );
    const start = toDayString(project?.start_date);
    if (mark.doneOn && start && mark.doneOn < start) {
      throw new BlockingRuleError(
        `${mark.doneOn} is before the project started (${start}). Check the date.`,
      );
    }

    await q(
      `INSERT INTO ee.design_project_activities
         (project_id, activity_id, done_on, not_applicable, remark, updated_by)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       ON CONFLICT (project_id, activity_id) DO UPDATE SET
         done_on        = CASE WHEN $7 THEN EXCLUDED.done_on ELSE ee.design_project_activities.done_on END,
         not_applicable = CASE WHEN $8 THEN EXCLUDED.not_applicable ELSE ee.design_project_activities.not_applicable END,
         remark         = CASE WHEN $9 THEN EXCLUDED.remark ELSE ee.design_project_activities.remark END,
         updated_by     = EXCLUDED.updated_by,
         updated_at     = NOW()`,
      [
        projectId,
        activityId,
        mark.doneOn ?? null,
        mark.notApplicable ?? false,
        mark.remark ?? null,
        user.id,
        mark.doneOn !== undefined,
        mark.notApplicable !== undefined,
        mark.remark !== undefined,
      ],
    );
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_ACTIVITY_MARKED",
    resourceType: "design_tracker",
    resourceId: projectId,
    newValues: { activityId, ...mark },
  });
}

/**
 * Several activities on one project done (or undone) at once — the Update
 * screen's "all late ones are done" and its Undo. One transaction: either
 * every activity moves or none does. `doneOn: null` puts them back to open.
 * An activity marked N/A is left alone either way.
 */
export async function markProjectActivitiesDone(
  user: SessionUser,
  projectId: string,
  activityIds: string[],
  doneOn: string | null,
): Promise<number> {
  await requireWorkRecorder(user, projectId);
  const settings = await getDesignSettings();
  const ids = [...new Set(activityIds)];
  if (ids.length === 0) throw new BlockingRuleError("Pick at least one activity.");
  if (doneOn && doneOn > settings.today) {
    throw new BlockingRuleError(
      `${doneOn} is after today (${settings.today}). Record activities done on the day they were done.`,
    );
  }

  const changed = await withTransaction(async (q) => {
    const known = await q<{ id: string }>(
      `SELECT id FROM ee.design_activities WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    if (known.length !== ids.length) throw new NotFoundError("One of those activities is not in the chart.");

    const [project] = await q<{ start_date: string | null }>(
      `SELECT start_date::text AS start_date FROM ee.design_projects WHERE id = $1`,
      [projectId],
    );
    const start = toDayString(project?.start_date);
    if (doneOn && start && doneOn < start) {
      throw new BlockingRuleError(`${doneOn} is before the project started (${start}). Check the date.`);
    }

    const rows = await q<{ activity_id: string }>(
      `INSERT INTO ee.design_project_activities (project_id, activity_id, done_on, updated_by)
       SELECT $1, a, $2::date, $3 FROM unnest($4::uuid[]) AS a
       ON CONFLICT (project_id, activity_id) DO UPDATE SET
         done_on = EXCLUDED.done_on, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       WHERE NOT ee.design_project_activities.not_applicable
       RETURNING activity_id`,
      [projectId, doneOn, user.id, ids],
    );
    return rows.length;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_ACTIVITIES_MARKED",
    resourceType: "design_tracker",
    resourceId: projectId,
    newValues: { activityIds: ids, doneOn, changed },
  });
  return changed;
}

// ── Setup ───────────────────────────────────────────────────────────

export type ChartPatch = Partial<{
  dueDay: number | null;
  standardDays: number | null;
  dependsOn: string;
  dependsOnClient: boolean;
}>;

export async function updateChartActivity(
  user: SessionUser,
  id: string,
  patch: ChartPatch,
): Promise<void> {
  await requireManager(user);

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.dueDay !== undefined) set("due_day", patch.dueDay);
  if (patch.standardDays !== undefined) set("standard_days", patch.standardDays);
  if (patch.dependsOn !== undefined) {
    if (!patch.dependsOn.trim()) {
      throw new BlockingRuleError("Every activity depends on somebody — name who.");
    }
    set("depends_on", patch.dependsOn.trim());
  }
  if (patch.dependsOnClient !== undefined) set("depends_on_client", patch.dependsOnClient);
  if (sets.length === 0) throw new BlockingRuleError("Nothing to change — the patch was empty.");

  values.push(id);
  const rows = await query<{ id: string }>(
    `UPDATE ee.design_activities SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length} RETURNING id`,
    values,
  );
  if (rows.length === 0) throw new NotFoundError("That activity is not in the chart.");

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_CHART_RETUNED",
    resourceType: "design_tracker",
    resourceId: id,
    newValues: patch,
  });
}

export type DesignSettingsPatch = Partial<{
  /** A date pins the board; null returns it to the calendar. */
  today: string | null;
  warmWithin: number;
  teamName: string;
}>;

export async function updateDesignSettings(
  user: SessionUser,
  patch: DesignSettingsPatch,
): Promise<void> {
  await requireManager(user);

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown, cast = "") => {
    values.push(value);
    sets.push(`${column} = $${values.length}${cast}`);
  };
  if (patch.teamName !== undefined) set("team_name", patch.teamName);
  if (patch.warmWithin !== undefined) {
    if (patch.warmWithin < 0) throw new BlockingRuleError("The warm window cannot be negative.");
    set("warm_within", patch.warmWithin);
  }
  if (patch.today !== undefined) {
    set("today_stamp", patch.today, "::date");
    set("stamped_by", patch.today === null ? null : user.id, "::uuid");
    sets.push(patch.today === null ? "stamped_at = NULL" : "stamped_at = NOW()");
  }
  if (sets.length === 0) throw new BlockingRuleError("Nothing to change — the patch was empty.");

  await query(
    `UPDATE ee.design_tracker_settings SET ${sets.join(", ")}, updated_at = NOW() WHERE id = 1`,
    values,
  );

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_TRACKER_SETTINGS_UPDATED",
    resourceType: "design_tracker",
    resourceId: null,
    newValues: patch,
  });
}
