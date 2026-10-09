import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { PermissionError } from "@/lib/services/permissions";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";
import { getSession, type SessionUser } from "@/lib/auth/session";

/**
 * Team Weekly Board — Jiya's log of what each design team did this week
 * (db/062). Read at the end of the week, then cleared; removing is the point,
 * not an accident, and every removal is audited with the row it took away.
 *
 * ACCESS is the design tracker's list (db/050), the same way /design-board
 * decides: anybody on ee.design_tracker_people, plus L0 / L1. Everybody who
 * may read may also add, change and remove — the board is one person's
 * notebook that the team can see, not a workflow with stages.
 */

export type WeeklyStatus = "done" | "progress" | "pending";
export type OptionKind = "team" | "particular" | "work_type";

export type WeeklyEntry = {
  id: string;
  team: string;
  particular: string;
  workType: string;
  title: string;
  qty: number;
  workDate: string;
  status: WeeklyStatus;
  createdAt: string;
};

export type TeamWeeklyBoard = {
  teams: string[];
  particulars: string[];
  workTypes: string[];
  entries: WeeklyEntry[];
  /** Today in India, so the page opens on the right week whatever the server's zone. */
  today: string;
};

class TeamWeeklyAccessError extends PermissionError {
  constructor(user: SessionUser, message: string) {
    super(user, "read", "team_weekly");
    this.message = message;
  }
}

function indiaToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Also the Stage Tracker's door (lib/services/stage-tracker.ts) — same people. */
export async function requireBoardUser(user: SessionUser): Promise<void> {
  if (user.accessLevel === "L0" || user.accessLevel === "L1") return;
  const rows = await query<{ one: number }>(
    `SELECT 1 AS one FROM ee.design_tracker_people
      WHERE user_id = $1 AND is_active LIMIT 1`,
    [user.id],
  );
  if (rows.length === 0) {
    throw new TeamWeeklyAccessError(
      user,
      "The Team Weekly Board is kept by the design team. Ask Vishakha or Monica to add you.",
    );
  }
}

/**
 * The door for the Team Weekly and 3D boards themselves. They open without
 * signing in (Monica, 8 Oct: "nahi chahiye, hata do pass") — the link is the
 * way in, as it is for /board. Somebody who IS signed in is still checked
 * against the design list, and their name goes on the audit row; a change made
 * from the open link is audited with no name.
 *
 * TEAM_BOARD_REQUIRE_LOGIN=true puts the sign-in back without a code change.
 * The Stage Tracker keeps requireBoardUser above and is not opened by this.
 */
export async function requireBoardAccess(user: SessionUser | null): Promise<void> {
  if (user) return requireBoardUser(user);
  if (process.env.TEAM_BOARD_REQUIRE_LOGIN === "true") {
    throw new BlockingRuleError("Sign in to use the Team Weekly Board.");
  }
}

/** Who is looking: the signed-in account, or null for somebody on the open link. */
export async function boardVisitor(): Promise<SessionUser | null> {
  return (await getSession().catch(() => null))?.user ?? null;
}

/** Never throws: for deciding whether to show a link. Fails closed. */
export async function mayUseTeamWeekly(user: SessionUser | null): Promise<boolean> {
  if (!user?.id) return false;
  try {
    await requireBoardAccess(user);
    return true;
  } catch {
    return false;
  }
}

async function listOptions(): Promise<Record<OptionKind, string[]>> {
  const rows = await query<{ kind: OptionKind; name: string }>(
    `SELECT kind, name FROM ee.team_weekly_options ORDER BY kind, sort_order, created_at`,
  );
  const out: Record<OptionKind, string[]> = { team: [], particular: [], work_type: [] };
  for (const r of rows) out[r.kind].push(r.name);
  return out;
}

export async function getTeamWeeklyBoard(user: SessionUser | null): Promise<TeamWeeklyBoard> {
  await requireBoardAccess(user);
  const [options, entries] = await Promise.all([
    listOptions(),
    query<WeeklyEntry>(
      `SELECT id, team, particular, work_type AS "workType", title, qty,
              work_date::text AS "workDate", status, created_at::text AS "createdAt"
         FROM ee.team_weekly_entries
        ORDER BY work_date DESC, created_at DESC`,
    ),
  ]);
  return {
    teams: options.team,
    particulars: options.particular,
    workTypes: options.work_type,
    entries,
    today: indiaToday(),
  };
}

export type NewWeeklyEntry = {
  team: string;
  /** No longer asked for (Monica, 9 Oct: "ye particular hatado"). Kept so an
   *  older client that still sends it is not refused; it is not stored. */
  particular?: string;
  workType: string;
  title: string;
  qty: number;
  workDate: string;
  status: WeeklyStatus;
};

/** A name that is not on the board's own list is refused, not quietly added. */
async function requireOption(kind: OptionKind, name: string, label: string): Promise<string> {
  const [row] = await query<{ name: string }>(
    `SELECT name FROM ee.team_weekly_options WHERE kind = $1 AND lower(name) = lower($2)`,
    [kind, name.trim()],
  );
  if (!row) throw new BlockingRuleError(`${label} "${name}" is not on the board's list. Add it first.`);
  return row.name;
}

export async function createWeeklyEntry(user: SessionUser | null, input: NewWeeklyEntry): Promise<string> {
  await requireBoardAccess(user);
  const team = await requireOption("team", input.team, "Team");
  const workType = await requireOption("work_type", input.workType, "Work type");
  // The column stays (db/062 has it NOT NULL, and old weeks carry RK / MR /
  // JKR); a new entry simply has none.
  const particular = "";
  const [row] = await query<{ id: string }>(
    `INSERT INTO ee.team_weekly_entries
       (team, particular, work_type, title, qty, work_date, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [team, particular, workType, input.title.trim(), input.qty, input.workDate, input.status, user?.id ?? null],
  );
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_WEEKLY_ENTRY_CREATED",
    resourceType: "team_weekly",
    resourceId: row.id,
    newValues: { team, workType, title: input.title.trim(), qty: input.qty, workDate: input.workDate },
  });
  return row.id;
}

export type WeeklyEntryPatch = Partial<{
  team: string;
  workType: string;
  title: string;
  qty: number;
  workDate: string;
  status: WeeklyStatus;
}>;

/**
 * Change an entry — its status from the Delay / In progress / Done buttons,
 * or any of its details from Edit (Monica, 9 Oct: "edit pe click karke ho
 * jaye"). A team or work type must still be one on the board's list.
 */
export async function updateWeeklyEntry(
  user: SessionUser | null,
  id: string,
  patch: WeeklyEntryPatch,
): Promise<void> {
  await requireBoardAccess(user);
  const sets: string[] = [];
  const values: unknown[] = [id];
  const put = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.team !== undefined) put("team", await requireOption("team", patch.team, "Team"));
  if (patch.workType !== undefined) put("work_type", await requireOption("work_type", patch.workType, "Work type"));
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw new BlockingRuleError("Say what was done.");
    put("title", patch.title.trim());
  }
  if (patch.qty !== undefined) put("qty", patch.qty);
  if (patch.workDate !== undefined) put("work_date", patch.workDate);
  if (patch.status !== undefined) put("status", patch.status);
  if (sets.length === 0) return;

  const [before] = await query<Record<string, unknown>>(
    `SELECT team, work_type, title, qty, work_date::text AS work_date, status
       FROM ee.team_weekly_entries WHERE id = $1`,
    [id],
  );
  if (!before) throw new NotFoundError("That entry is not on the board any more.");
  await query(`UPDATE ee.team_weekly_entries SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, values);
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_WEEKLY_ENTRY_UPDATED",
    resourceType: "team_weekly",
    resourceId: id,
    oldValues: before,
    newValues: patch,
  });
}

export async function setWeeklyStatus(user: SessionUser | null, id: string, status: WeeklyStatus): Promise<void> {
  await updateWeeklyEntry(user, id, { status });
}

/**
 * Remove one entry or a whole week's worth in one go. All or nothing: a
 * half-cleared week reads as a week where half the work never happened.
 */
export async function deleteWeeklyEntries(user: SessionUser | null, ids: string[]): Promise<number> {
  await requireBoardAccess(user);
  if (ids.length === 0) return 0;
  const removed = await withTransaction((q) =>
    q<{ id: string; team: string; particular: string; work_type: string; title: string; qty: number; work_date: string; status: string }>(
      `DELETE FROM ee.team_weekly_entries WHERE id = ANY($1::uuid[])
       RETURNING id, team, particular, work_type, title, qty, work_date::text AS work_date, status`,
      [ids],
    ),
  );
  if (removed.length === 0) throw new NotFoundError("Those entries are not on the board any more.");
  for (const r of removed) {
    await writeAudit({
      userId: user?.id ?? null,
      role: user?.accessLevel ?? null,
      action: "TEAM_WEEKLY_ENTRY_DELETED",
      resourceType: "team_weekly",
      resourceId: r.id,
      oldValues: r,
    });
  }
  return removed.length;
}

export async function addWeeklyOption(user: SessionUser | null, kind: OptionKind, name: string): Promise<void> {
  await requireBoardAccess(user);
  const clean = name.trim();
  if (!clean) throw new BlockingRuleError("Give the new option a name.");
  const [exists] = await query<{ name: string }>(
    `SELECT name FROM ee.team_weekly_options WHERE kind = $1 AND lower(name) = lower($2)`,
    [kind, clean],
  );
  if (exists) throw new ConflictError(`"${exists.name}" is already on the list.`);
  await query(
    `INSERT INTO ee.team_weekly_options (kind, name, sort_order)
     SELECT $1, $2, COALESCE(MAX(sort_order), 0) + 10 FROM ee.team_weekly_options WHERE kind = $1`,
    [kind, clean],
  );
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_WEEKLY_OPTION_ADDED",
    resourceType: "team_weekly",
    newValues: { kind, name: clean },
  });
}

// ---------------------------------------------------------------------------
// The 3D page (db/063): Team Neeru and Team Dhruv, each project in one of
// three stages. Same people, same access as the weekly board.
// ---------------------------------------------------------------------------

export type Stage3d = "ongoing" | "revisions" | "signoff";

export type Project3d = {
  id: string;
  teamId: string;
  stage: Stage3d;
  name: string;
  client: string | null;
  notes: string | null;
  updatedAt: string;
};

export type Team3dBoard = {
  teams: { id: string; name: string }[];
  projects: Project3d[];
};

export async function getTeam3dBoard(user: SessionUser | null): Promise<Team3dBoard> {
  await requireBoardAccess(user);
  const [teams, projects] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM ee.team_3d_teams ORDER BY sort_order, name`,
    ),
    query<Project3d>(
      `SELECT id, team_id AS "teamId", stage, name, client, notes,
              updated_at::text AS "updatedAt"
         FROM ee.team_3d_projects
        ORDER BY updated_at DESC`,
    ),
  ]);
  return { teams, projects };
}

export type NewProject3d = {
  teamId: string;
  stage: Stage3d;
  name: string;
  client?: string | null;
  notes?: string | null;
};

function blank(v: string | null | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

export async function createProject3d(user: SessionUser | null, input: NewProject3d): Promise<string> {
  await requireBoardAccess(user);
  const [team] = await query<{ name: string }>(`SELECT name FROM ee.team_3d_teams WHERE id = $1`, [input.teamId]);
  if (!team) throw new BlockingRuleError("That team is not on the 3D board.");
  const [row] = await query<{ id: string }>(
    `INSERT INTO ee.team_3d_projects (team_id, stage, name, client, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.teamId, input.stage, input.name.trim(), blank(input.client), blank(input.notes), user?.id ?? null],
  );
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_3D_PROJECT_CREATED",
    resourceType: "team_weekly",
    resourceId: row.id,
    newValues: { team: team.name, stage: input.stage, name: input.name.trim() },
  });
  return row.id;
}

export type Project3dPatch = Partial<{
  stage: Stage3d;
  name: string;
  client: string | null;
  notes: string | null;
}>;

export async function updateProject3d(user: SessionUser | null, id: string, patch: Project3dPatch): Promise<void> {
  await requireBoardAccess(user);
  const sets: string[] = [];
  const values: unknown[] = [id];
  const put = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.stage !== undefined) put("stage", patch.stage);
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw new BlockingRuleError("A project needs a name.");
    put("name", patch.name.trim());
  }
  if (patch.client !== undefined) put("client", blank(patch.client));
  if (patch.notes !== undefined) put("notes", blank(patch.notes));
  if (sets.length === 0) return;
  const [before] = await query<Record<string, unknown>>(
    `SELECT stage, name, client, notes FROM ee.team_3d_projects WHERE id = $1`,
    [id],
  );
  if (!before) throw new NotFoundError("That project is not on the 3D board any more.");
  await query(
    `UPDATE ee.team_3d_projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`,
    values,
  );
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_3D_PROJECT_UPDATED",
    resourceType: "team_weekly",
    resourceId: id,
    oldValues: before,
    newValues: patch,
  });
}

export async function deleteProject3d(user: SessionUser | null, id: string): Promise<void> {
  await requireBoardAccess(user);
  const [row] = await query<Record<string, unknown>>(
    `DELETE FROM ee.team_3d_projects WHERE id = $1
     RETURNING team_id, stage, name, client, notes`,
    [id],
  );
  if (!row) throw new NotFoundError("That project is not on the 3D board any more.");
  await writeAudit({
    userId: user?.id ?? null,
    role: user?.accessLevel ?? null,
    action: "TEAM_3D_PROJECT_DELETED",
    resourceType: "team_weekly",
    resourceId: id,
    oldValues: row,
  });
}
