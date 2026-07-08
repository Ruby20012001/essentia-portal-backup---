import { withUserContext } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { publishEvent } from "@/lib/notifications";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * WIO — universal work initiation (Brief §29-30, Velocity Gate 3).
 * The 15-day conversion clock and the three-item checklist gate live here.
 * Department routing is FK-enforced against the Department Master; the
 * window and receiving departments come from config, never constants.
 * Lifecycle events (created / converted / cancelled / clock alerts) notify
 * the project's CRM TL — §30 makes the TL the owner of the window.
 * Cancellation never deletes: the row leaves the clock view but keeps its
 * timestamps, approvals, and audit trail (see listWioHistory).
 */

export type WioStatus = "initiated" | "in_progress" | "on_hold" | "cancelled";

export type Wio = {
  id: string;
  wioNumber: string;
  projectId: string;
  projectCode: string;
  projectName: string | null;
  familyName: string;
  department: string;
  status: string;
  initiatedDate: string;
  targetPioDate: string;
  daysRemaining: number;
  clockRag: "green" | "amber" | "red";
  isOverdue: boolean;
  boqApproved: boolean;
  design3dApproved: boolean;
  sldApproved: boolean;
  checklistComplete: boolean;
  notes: string | null;
};

export type WioHistoryEntry = {
  id: string;
  wioNumber: string;
  projectCode: string;
  department: string;
  status: string;
  initiatedDate: string;
  targetPioDate: string;
  actualPioDate: string | null;
  boqApproved: boolean;
  design3dApproved: boolean;
  sldApproved: boolean;
  createdAt: string;
  updatedAt: string;
};

const CHECKLIST_LABELS: Record<string, string> = {
  boq_approved: "Approved BOQ",
  design_3d_approved: "Approved 3D",
  sld_approved: "Approved SLD",
};

type WioRow = {
  id: string;
  wio_number: string;
  project_id: string;
  project_code: string;
  project_name: string | null;
  family_name: string;
  department_code: string;
  status: string;
  initiated_date: string;
  target_pio_date: string;
  days_remaining: number;
  clock_rag: Wio["clockRag"];
  is_overdue: boolean;
  boq_approved: boolean;
  design_3d_approved: boolean;
  sld_approved: boolean;
  checklist_complete: boolean;
  notes: string | null;
};

function toWio(row: WioRow): Wio {
  return {
    id: row.id,
    wioNumber: row.wio_number,
    projectId: row.project_id,
    projectCode: row.project_code,
    projectName: row.project_name,
    familyName: row.family_name,
    department: row.department_code,
    status: row.status,
    initiatedDate: row.initiated_date,
    targetPioDate: row.target_pio_date,
    daysRemaining: row.days_remaining,
    clockRag: row.clock_rag,
    isOverdue: row.is_overdue,
    boqApproved: row.boq_approved,
    design3dApproved: row.design_3d_approved,
    sldApproved: row.sld_approved,
    checklistComplete: row.checklist_complete,
    notes: row.notes,
  };
}

const CLOCK_SELECT = `
  SELECT id, wio_number, project_id, project_code, project_name, family_name,
         department_code, status, initiated_date::TEXT, target_pio_date::TEXT,
         days_remaining, clock_rag, is_overdue,
         boq_approved, design_3d_approved, sld_approved, checklist_complete,
         notes
  FROM ee.wio_clock`;

/** Open WIOs on the conversion clock, most urgent first (RLS-scoped). */
export async function listWios(user: SessionUser): Promise<Wio[]> {
  await requirePermission(user, "read", "wio");
  return withUserContext(user, async (q) => {
    const rows = await q<WioRow>(`${CLOCK_SELECT} ORDER BY days_remaining ASC`);
    return rows.map(toWio);
  });
}

/**
 * Full history — every status including converted and cancelled, with
 * timestamps and approvals preserved, searchable by number (RLS-scoped).
 */
export async function listWioHistory(
  user: SessionUser,
  search?: string,
): Promise<WioHistoryEntry[]> {
  await requirePermission(user, "read", "wio");
  return withUserContext(user, async (q) => {
    const rows = await q<{
      id: string;
      wio_number: string;
      project_code: string;
      department_code: string;
      status: string;
      initiated_date: string;
      target_pio_date: string;
      actual_pio_date: string | null;
      boq_approved: boolean;
      design_3d_approved: boolean;
      sld_approved: boolean;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT w.id, w.wio_number, p.project_code, w.department_code, w.status,
              w.initiated_date::TEXT, w.target_pio_date::TEXT,
              w.actual_pio_date::TEXT,
              w.boq_approved, w.design_3d_approved, w.sld_approved,
              w.created_at::TEXT, w.updated_at::TEXT
       FROM ee.wio w
       JOIN ee.projects p ON p.id = w.project_id
       WHERE ($1::TEXT IS NULL OR w.wio_number ILIKE '%' || $1 || '%')
       ORDER BY w.created_at DESC
       LIMIT 100`,
      [search ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      wioNumber: r.wio_number,
      projectCode: r.project_code,
      department: r.department_code,
      status: r.status,
      initiatedDate: r.initiated_date,
      targetPioDate: r.target_pio_date,
      actualPioDate: r.actual_pio_date,
      boqApproved: r.boq_approved,
      design3dApproved: r.design_3d_approved,
      sldApproved: r.sld_approved,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  });
}

/** The departments that receive WIOs (config, validated against the master). */
export async function getWioDepartments(): Promise<string[]> {
  return getConfig<string[]>("wio.departments", []);
}

export async function createWio(
  user: SessionUser,
  input: { projectId: string; departmentCode: string; notes?: string },
): Promise<Wio> {
  await requirePermission(user, "create", "wio");
  const conversionDays = await getConfig<number>("wio.conversion_days", 15);

  const { wio, crmtlId } = await withUserContext(user, async (q) => {
    // RLS decides project visibility — a project outside the user's fence
    // reads as nonexistent.
    const [project] = await q<{
      id: string;
      project_code: string;
      crmtl_id: string | null;
    }>(
      `SELECT id, project_code, crmtl_id FROM ee.projects WHERE id = $1 AND is_active`,
      [input.projectId],
    );
    if (!project) {
      throw new NotFoundError("Project not found or not visible to you");
    }

    let inserted: { id: string };
    try {
      [inserted] = await q<{ id: string }>(
        `INSERT INTO ee.wio
           (wio_number, project_id, department_code, target_pio_date, initiated_by, notes)
         VALUES (next_wio_number($1), $2, $1, CURRENT_DATE + $3::INTEGER, $4, $5)
         RETURNING id`,
        [
          input.departmentCode,
          input.projectId,
          conversionDays,
          user.id,
          input.notes ?? null,
        ],
      );
    } catch (error) {
      if ((error as { code?: string }).code === "23503") {
        throw new ConflictError(
          `Department '${input.departmentCode}' is not in the Department Master — WIO routing only accepts master codes`,
        );
      }
      throw error;
    }

    const [created] = await q<WioRow>(`${CLOCK_SELECT} WHERE id = $1`, [
      inserted.id,
    ]);
    return { wio: toWio(created), crmtlId: project.crmtl_id };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_CREATE",
    resourceType: "wio",
    resourceId: wio.id,
    newValues: {
      wioNumber: wio.wioNumber,
      department: wio.department,
      projectId: wio.projectId,
    },
  });
  if (crmtlId) {
    await publishEvent({
      type: "wio.created",
      category: "project",
      entityType: "wio",
      entityId: wio.id,
      entityRef: wio.wioNumber,
      actorId: user.id,
      payload: {
        recipientId: crmtlId,
        wioNumber: wio.wioNumber,
        projectCode: wio.projectCode,
        department: wio.department,
        days: conversionDays,
      },
    });
  }
  return wio;
}

const CHECKLIST_COLUMNS = new Set([
  "boq_approved",
  "design_3d_approved",
  "sld_approved",
]);

export async function updateWio(
  user: SessionUser,
  wioId: string,
  patch: {
    boqApproved?: boolean;
    design3dApproved?: boolean;
    sldApproved?: boolean;
    status?: WioStatus;
    notes?: string;
  },
): Promise<Wio> {
  await requirePermission(user, "edit", "wio");

  const columnPatch: Record<string, boolean | string> = {};
  if (patch.boqApproved !== undefined) columnPatch.boq_approved = patch.boqApproved;
  if (patch.design3dApproved !== undefined) columnPatch.design_3d_approved = patch.design3dApproved;
  if (patch.sldApproved !== undefined) columnPatch.sld_approved = patch.sldApproved;

  const { wio, previous, crmtlId } = await withUserContext(user, async (q) => {
    const [existing] = await q<{
      id: string;
      status: string;
      wio_number: string;
      department_code: string;
      project_code: string;
      crmtl_id: string | null;
      boq_approved: boolean;
      design_3d_approved: boolean;
      sld_approved: boolean;
    }>(
      `SELECT w.id, w.status, w.wio_number, w.department_code,
              p.project_code, p.crmtl_id,
              w.boq_approved, w.design_3d_approved, w.sld_approved
       FROM ee.wio w JOIN ee.projects p ON p.id = w.project_id
       WHERE w.id = $1
       FOR UPDATE OF w`,
      [wioId],
    );
    if (!existing) throw new NotFoundError("WIO not found or not visible to you");
    if (existing.status === "converted_to_pio") {
      throw new ConflictError(
        `${existing.wio_number} has already converted to PIO — it can no longer change`,
      );
    }
    if (existing.status === "cancelled") {
      throw new ConflictError(
        `${existing.wio_number} is cancelled — history is immutable`,
      );
    }

    const sets: string[] = [];
    const params: unknown[] = [wioId];
    for (const [column, value] of Object.entries(columnPatch)) {
      if (!CHECKLIST_COLUMNS.has(column)) continue;
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    if (patch.status) {
      params.push(patch.status);
      sets.push(`status = $${params.length}::wio_status`);
    }
    if (patch.notes !== undefined) {
      params.push(patch.notes);
      sets.push(`notes = $${params.length}`);
    }
    if (sets.length === 0) throw new ConflictError("Nothing to update");
    sets.push("updated_at = NOW()");

    await q(`UPDATE ee.wio SET ${sets.join(", ")} WHERE id = $1`, params);
    const [row] = await q<WioRow>(`${CLOCK_SELECT} WHERE id = $1`, [wioId]);
    const snapshot: Wio = row
      ? toWio(row)
      : // Cancelling removes the WIO from the clock view — return a
        // terminal snapshot rather than erroring on a successful update.
        ({
          id: existing.id,
          wioNumber: existing.wio_number,
          status: patch.status ?? existing.status,
        } as Wio);
    return {
      wio: snapshot,
      previous: {
        status: existing.status,
        boqApproved: existing.boq_approved,
        design3dApproved: existing.design_3d_approved,
        sldApproved: existing.sld_approved,
      },
      crmtlId: existing.crmtl_id,
      wioNumber: existing.wio_number,
      projectCode: existing.project_code,
      department: existing.department_code,
    };
  }).then(async (result) => {
    if (patch.status === "cancelled" && result.crmtlId) {
      await publishEvent({
        type: "wio.cancelled",
        category: "project",
        entityType: "wio",
        entityId: wioId,
        entityRef: result.wioNumber,
        actorId: user.id,
        payload: {
          recipientId: result.crmtlId,
          wioNumber: result.wioNumber,
          projectCode: result.projectCode,
          department: result.department,
        },
      });
    }
    return result;
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: patch.status === "cancelled" ? "WIO_CANCEL" : "WIO_UPDATE",
    resourceType: "wio",
    resourceId: wioId,
    oldValues: previous,
    newValues: patch,
  });
  void crmtlId;
  return wio;
}

/**
 * The §30 gate: a WIO converts to a PIO only when all three checklist items
 * are approved. Refusal is loud and exact — never a silent block. The WIO
 * row is locked for the transaction, so a double-convert race resolves to
 * one PIO and one conflict.
 */
export async function convertWioToPio(
  user: SessionUser,
  wioId: string,
): Promise<{ pioId: string; pioNumber: string; wio: Wio }> {
  await requirePermission(user, "create", "pio");
  const factoryDays = await getConfig<number>("pio.factory_days", 45);

  const result = await withUserContext(user, async (q) => {
    const [wio] = await q<{
      id: string;
      wio_number: string;
      project_id: string;
      project_code: string;
      crmtl_id: string | null;
      status: string;
      boq_approved: boolean;
      design_3d_approved: boolean;
      sld_approved: boolean;
    }>(
      `SELECT w.id, w.wio_number, w.project_id, p.project_code, p.crmtl_id,
              w.status, w.boq_approved, w.design_3d_approved, w.sld_approved
       FROM ee.wio w JOIN ee.projects p ON p.id = w.project_id
       WHERE w.id = $1
       FOR UPDATE OF w`,
      [wioId],
    );
    if (!wio) throw new NotFoundError("WIO not found or not visible to you");
    if (wio.status === "converted_to_pio") {
      throw new ConflictError(`${wio.wio_number} has already converted to PIO`);
    }
    if (wio.status === "cancelled" || wio.status === "on_hold") {
      throw new ConflictError(
        `${wio.wio_number} is ${wio.status.replace("_", " ")} — resume it before converting`,
      );
    }

    const missing = Object.entries({
      boq_approved: wio.boq_approved,
      design_3d_approved: wio.design_3d_approved,
      sld_approved: wio.sld_approved,
    })
      .filter(([, done]) => !done)
      .map(([key]) => CHECKLIST_LABELS[key]);
    if (missing.length > 0) {
      throw new BlockingRuleError(
        `${wio.wio_number} cannot convert to PIO — checklist incomplete: ` +
          `${missing.join(" + ")} pending. All three approvals must be in ` +
          `place before a PIO is released (Brief §30).`,
      );
    }

    const [pio] = await q<{ id: string; pio_number: string }>(
      `INSERT INTO ee.pio (pio_number, wio_id, project_id, target_complete, initiated_by)
       VALUES (next_pio_number(), $1, $2, CURRENT_DATE + $3::INTEGER, $4)
       RETURNING id, pio_number`,
      [wio.id, wio.project_id, factoryDays, user.id],
    );
    await q(
      `UPDATE ee.wio
       SET status = 'converted_to_pio', actual_pio_date = CURRENT_DATE, updated_at = NOW()
       WHERE id = $1`,
      [wio.id],
    );

    return {
      pioId: pio.id,
      pioNumber: pio.pio_number,
      wioNumber: wio.wio_number,
      projectCode: wio.project_code,
      crmtlId: wio.crmtl_id,
    };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WIO_CONVERT",
    resourceType: "wio",
    resourceId: wioId,
    newValues: { pioId: result.pioId, pioNumber: result.pioNumber },
  });
  if (result.crmtlId) {
    await publishEvent({
      type: "wio.converted",
      category: "project",
      entityType: "wio",
      entityId: wioId,
      entityRef: result.wioNumber,
      actorId: user.id,
      payload: {
        recipientId: result.crmtlId,
        wioNumber: result.wioNumber,
        pioNumber: result.pioNumber,
        projectCode: result.projectCode,
      },
    });
  }

  // The converted WIO leaves the clock view; return a terminal snapshot.
  return {
    pioId: result.pioId,
    pioNumber: result.pioNumber,
    wio: {
      id: wioId,
      wioNumber: result.wioNumber,
      status: "converted_to_pio",
    } as Wio,
  };
}

/**
 * Escalation sweep (Brief §30: day-12 alert, day-15 lapse). Notifies each
 * WIO's project TL once per day per condition — deduped on today's
 * notifications. Invoked by POST /api/jobs/wio-clock (the auto-pilot
 * scheduler will own the cadence; see docs/ASSUMPTIONS_DECISIONS.md).
 */
export async function sweepWioClock(
  user: SessionUser,
): Promise<{ alerts: number; overdue: number }> {
  await requirePermission(user, "escalate", "wio");
  const conversionDays = await getConfig<number>("wio.conversion_days", 15);
  const alertDay = await getConfig<number>("wio.alert_day", 12);
  const alertWindow = Math.max(conversionDays - alertDay, 0);

  const candidates = await withUserContext(user, async (q) => {
    return q<{
      id: string;
      wio_number: string;
      project_code: string;
      department_code: string;
      is_overdue: boolean;
      crmtl_id: string | null;
    }>(
      `SELECT c.id, c.wio_number, c.project_code, c.department_code,
              c.is_overdue, p.crmtl_id
       FROM ee.wio_clock c
       JOIN ee.projects p ON p.id = c.project_id
       WHERE c.is_overdue OR c.days_remaining <= $1`,
      [alertWindow],
    );
  });

  // Publish one event per due WIO. dedupeKey (per WIO per day per kind)
  // centralises the once-a-day guard in the event bus — a repeat sweep the
  // same day is deduped and produces no new delivery.
  const today = new Date().toISOString().slice(0, 10);
  let alerts = 0;
  let overdue = 0;
  for (const row of candidates) {
    if (!row.crmtl_id) continue;
    const kind = row.is_overdue ? "wio.clock_overdue" : "wio.clock_alert";
    const { deduped } = await publishEvent({
      type: kind,
      category: "project",
      entityType: "wio",
      entityId: row.id,
      entityRef: row.wio_number,
      dedupeKey: `${kind}:${row.id}:${today}`,
      payload: {
        recipientId: row.crmtl_id,
        wioNumber: row.wio_number,
        projectCode: row.project_code,
        department: row.department_code,
      },
    });
    if (deduped) continue;
    if (row.is_overdue) overdue += 1;
    else alerts += 1;
  }
  return { alerts, overdue };
}
