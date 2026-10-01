import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/blocking";
import {
  cleanSiteWork,
  sortByDue,
  type DeskProject,
  type ProjectType,
  type Stage,
} from "@/lib/services/project-desk-logic";

/**
 * Project Desk — data access. Every signed-in person may read and change
 * every project; the desk is shared by the whole team on purpose. The rules
 * (late, progress) live in project-desk-logic.ts.
 *
 * Dates come back as text, never as JS Date: pg turns a DATE into a midnight
 * in the server's timezone, which on a UTC host is the day before in India.
 */

const COLUMNS = `
  id::INT AS id, name, client, city, type, stage, owner, next_step,
  to_char(due_date, 'YYYY-MM-DD') AS due_date,
  site_work,
  to_char(updated_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI:SS"+05:30"') AS updated_at,
  updated_by`;

export async function listDeskProjects(): Promise<DeskProject[]> {
  const rows = await query<DeskProject>(`SELECT ${COLUMNS} FROM desk.projects`);
  return sortByDue(rows.map((r) => ({ ...r, site_work: cleanSiteWork(r.site_work) })));
}

export type NewDeskProject = {
  name: string;
  client?: string | null;
  city?: string | null;
  type: ProjectType;
  stage: Stage;
  owner?: string | null;
  next_step?: string | null;
  due_date?: string | null;
};

export async function addDeskProject(user: SessionUser, p: NewDeskProject): Promise<DeskProject> {
  const [row] = await query<DeskProject>(
    `INSERT INTO desk.projects (name, client, city, type, stage, owner, next_step, due_date, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${COLUMNS}`,
    [
      p.name.trim(),
      blank(p.client),
      blank(p.city),
      p.type,
      p.stage,
      blank(p.owner),
      blank(p.next_step),
      p.due_date || null,
      user.name,
    ],
  );
  return row;
}

export type DeskProjectChange = Partial<NewDeskProject> & { site_work?: string[] };

export async function updateDeskProject(
  user: SessionUser,
  id: number,
  change: DeskProjectChange,
): Promise<DeskProject> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const put = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (change.name !== undefined) put("name", change.name.trim());
  if (change.client !== undefined) put("client", blank(change.client));
  if (change.city !== undefined) put("city", blank(change.city));
  if (change.type !== undefined) put("type", change.type);
  if (change.stage !== undefined) put("stage", change.stage);
  if (change.owner !== undefined) put("owner", blank(change.owner));
  if (change.next_step !== undefined) put("next_step", blank(change.next_step));
  if (change.due_date !== undefined) put("due_date", change.due_date || null);
  if (change.site_work !== undefined) put("site_work", JSON.stringify(cleanSiteWork(change.site_work)));

  put("updated_by", user.name);
  values.push(id);
  const [row] = await query<DeskProject>(
    `UPDATE desk.projects SET ${sets.join(", ")}, updated_at = NOW()
      WHERE id = $${values.length}
     RETURNING ${COLUMNS}`,
    values,
  );
  if (!row) throw new NotFoundError("That project is no longer on the desk.");
  return { ...row, site_work: cleanSiteWork(row.site_work) };
}

export async function removeDeskProject(id: number): Promise<void> {
  const rows = await query(`DELETE FROM desk.projects WHERE id = $1 RETURNING id`, [id]);
  if (rows.length === 0) throw new NotFoundError("That project is no longer on the desk.");
}

function blank(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}
