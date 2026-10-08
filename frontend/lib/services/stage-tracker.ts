import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";
import { requireBoardUser } from "@/lib/services/team-weekly";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Stage Tracker — the MASTER SHEET's three phases as one board (db/064):
 * ID first, with 3D and Architecture beside it. One row per project per tab.
 *
 * ACCESS is the Team Weekly Board's: the design tracker's list plus L0 / L1.
 * Everybody who may read may also add, change and remove.
 *
 * "AAJ KYA BADLA" is updated_at, read in Asia/Kolkata. Every field change
 * bumps it and is audited with what it was before, so the day's changes can
 * be shown on the board and traced afterwards.
 */

export type Discipline = "id" | "3d" | "arch";

/** The editable text fields, by tab. Column names are these, snake-cased. */
export const FIELDS: Record<Discipline, readonly StageField[]> = {
  id: [
    "member",
    "layoutStart", "layoutEnd", "layoutSignoff",
    "vibeStart", "vibeEnd", "vibeSignoff",
    "camStart", "camEnd", "camSignoff",
    "status",
  ],
  "3d": ["member", "startDate", "endDate", "status"],
  arch: ["member", "status", "techDrawings", "boundbook", "extGfc"],
};

export const ALL_FIELDS = [
  "member", "status",
  "layoutStart", "layoutEnd", "layoutSignoff",
  "vibeStart", "vibeEnd", "vibeSignoff",
  "camStart", "camEnd", "camSignoff",
  "startDate", "endDate",
  "techDrawings", "boundbook", "extGfc",
] as const;
export type StageField = (typeof ALL_FIELDS)[number];

const COLUMN: Record<StageField, string> = {
  member: "member",
  status: "status",
  layoutStart: "layout_start",
  layoutEnd: "layout_end",
  layoutSignoff: "layout_signoff",
  vibeStart: "vibe_start",
  vibeEnd: "vibe_end",
  vibeSignoff: "vibe_signoff",
  camStart: "cam_start",
  camEnd: "cam_end",
  camSignoff: "cam_signoff",
  startDate: "start_date",
  endDate: "end_date",
  techDrawings: "tech_drawings",
  boundbook: "boundbook",
  extGfc: "ext_gfc",
};

export type StageRow = {
  id: string;
  discipline: Discipline;
  project: string;
  updatedAt: string;
  /** Touched today, India time — computed by the database, not the browser. */
  updatedToday: boolean;
} & Record<StageField, string | null>;

export type StageBoard = {
  rows: StageRow[];
  /** Today in India, for the "updated today" line. */
  today: string;
};

const SELECT_FIELDS = ALL_FIELDS.map((f) => `${COLUMN[f]} AS "${f}"`).join(", ");

export async function getStageBoard(user: SessionUser): Promise<StageBoard> {
  await requireBoardUser(user);
  const rows = await query<StageRow>(
    `SELECT id, discipline, project, ${SELECT_FIELDS},
            updated_at::text AS "updatedAt",
            (updated_at AT TIME ZONE 'Asia/Kolkata')::date
              = (NOW() AT TIME ZONE 'Asia/Kolkata')::date AS "updatedToday"
       FROM ee.stage_tracker_rows
      ORDER BY lower(project)`,
  );
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  return { rows, today };
}

function blank(v: string | null | undefined): string | null {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t : null;
}

async function requireUniqueName(discipline: Discipline, project: string, exceptId?: string) {
  const [dup] = await query<{ project: string }>(
    `SELECT project FROM ee.stage_tracker_rows
      WHERE discipline = $1 AND lower(btrim(project)) = lower(btrim($2))
        AND ($3::uuid IS NULL OR id <> $3::uuid)`,
    [discipline, project, exceptId ?? null],
  );
  if (dup) throw new ConflictError(`"${dup.project}" is already on this tab.`);
}

export type NewStageRow = {
  discipline: Discipline;
  project: string;
  member?: string | null;
};

export async function createStageRow(user: SessionUser, input: NewStageRow): Promise<string> {
  await requireBoardUser(user);
  const project = blank(input.project);
  if (!project) throw new BlockingRuleError("Name the project.");
  await requireUniqueName(input.discipline, project);
  const [row] = await query<{ id: string }>(
    `INSERT INTO ee.stage_tracker_rows (discipline, project, member, created_by)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [input.discipline, project, blank(input.member), user.id],
  );
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "STAGE_TRACKER_ROW_CREATED",
    resourceType: "stage_tracker",
    resourceId: row.id,
    newValues: { discipline: input.discipline, project, member: blank(input.member) },
  });
  return row.id;
}

export type StageRowPatch = Partial<Record<StageField | "project", string | null>>;

export async function updateStageRow(user: SessionUser, id: string, patch: StageRowPatch): Promise<void> {
  await requireBoardUser(user);
  const [before] = await query<Record<string, unknown> & { discipline: Discipline }>(
    `SELECT discipline, project, ${SELECT_FIELDS} FROM ee.stage_tracker_rows WHERE id = $1`,
    [id],
  );
  if (!before) throw new NotFoundError("That project is not on the tracker any more.");

  const sets: string[] = [];
  const values: unknown[] = [id];
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  const put = (column: string, key: string, value: string | null) => {
    if ((before[key] ?? null) === value) return;
    values.push(value);
    sets.push(`${column} = $${values.length}`);
    changed[key] = { from: before[key] ?? null, to: value };
  };

  if (patch.project !== undefined) {
    const project = blank(patch.project);
    if (!project) throw new BlockingRuleError("A project needs a name.");
    await requireUniqueName(before.discipline, project, id);
    put("project", "project", project);
  }
  const allowed = FIELDS[before.discipline];
  for (const f of ALL_FIELDS) {
    if (patch[f] === undefined) continue;
    if (!allowed.includes(f)) throw new BlockingRuleError(`"${f}" is not a column on this tab.`);
    put(COLUMN[f], f, blank(patch[f]));
  }
  if (sets.length === 0) return;

  await query(`UPDATE ee.stage_tracker_rows SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $1`, values);
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "STAGE_TRACKER_ROW_UPDATED",
    resourceType: "stage_tracker",
    resourceId: id,
    oldValues: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.from])),
    newValues: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.to])),
  });
}

export async function deleteStageRow(user: SessionUser, id: string): Promise<void> {
  await requireBoardUser(user);
  const [row] = await query<Record<string, unknown>>(
    `DELETE FROM ee.stage_tracker_rows WHERE id = $1
     RETURNING discipline, project, ${SELECT_FIELDS}`,
    [id],
  );
  if (!row) throw new NotFoundError("That project is not on the tracker any more.");
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "STAGE_TRACKER_ROW_DELETED",
    resourceType: "stage_tracker",
    resourceId: id,
    oldValues: row,
  });
}
