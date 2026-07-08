import { withUserContext } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { startWorkflow } from "@/lib/services/workflows";
import {
  BlockingRuleError,
  ConflictError,
  NotFoundError,
} from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * PIO — production initiation (Brief §29). Two permanent constraints live
 * here: the Triangle of Agreement (final BOQ + final 3D + client-signed GFC
 * + shared BOM, all four before release) and the §26 approval chain
 * (Khushpreet → Deepak Ji → Hardesh), which runs on the workflow engine —
 * this module never implements approvals itself.
 */

export type Pio = {
  id: string;
  pioNumber: string;
  projectId: string;
  projectCode: string;
  projectName: string | null;
  status: string;
  initiatedDate: string;
  targetComplete: string | null;
  daysRemaining: number | null;
  clockRag: "green" | "amber" | "red";
  finalBoqSigned: boolean;
  final3dSigned: boolean;
  gfcSignedByClient: boolean;
  bomShared: boolean;
  triangleComplete: boolean;
  approval: {
    instanceId: string;
    status: string;
    currentStep: number;
    totalSteps: number;
    stepName: string | null;
    approverHint: string | null;
  } | null;
};

const TRIANGLE_LABELS: Record<string, string> = {
  final_boq_signed: "Final BOQ signed",
  final_3d_signed: "Final 3D signed",
  gfc_signed_by_client: "GFC signed by client",
  bom_shared: "BOM shared",
};

type PioRow = {
  id: string;
  pio_number: string;
  project_id: string;
  project_code: string;
  project_name: string | null;
  status: string;
  initiated_date: string;
  target_complete: string | null;
  days_remaining: number | null;
  clock_rag: Pio["clockRag"];
  final_boq_signed: boolean;
  final_3d_signed: boolean;
  gfc_signed_by_client: boolean;
  bom_shared: boolean;
  triangle_complete: boolean;
  approval_instance_id: string | null;
  approval_status: string | null;
  approval_step: number | null;
  approval_total_steps: number | null;
  approval_step_name: string | null;
  approval_hint: string | null;
};

function toPio(row: PioRow): Pio {
  return {
    id: row.id,
    pioNumber: row.pio_number,
    projectId: row.project_id,
    projectCode: row.project_code,
    projectName: row.project_name,
    status: row.status,
    initiatedDate: row.initiated_date,
    targetComplete: row.target_complete,
    daysRemaining: row.days_remaining,
    clockRag: row.clock_rag,
    finalBoqSigned: row.final_boq_signed,
    final3dSigned: row.final_3d_signed,
    gfcSignedByClient: row.gfc_signed_by_client,
    bomShared: row.bom_shared,
    triangleComplete: row.triangle_complete,
    approval: row.approval_instance_id
      ? {
          instanceId: row.approval_instance_id,
          status: row.approval_status ?? "pending",
          currentStep: row.approval_step ?? 1,
          totalSteps: row.approval_total_steps ?? 3,
          stepName: row.approval_step_name,
          approverHint: row.approval_hint,
        }
      : null,
  };
}

const PIO_SELECT = `
  SELECT c.id, c.pio_number, c.project_id, c.project_code, c.project_name,
         c.status, c.initiated_date::TEXT, c.target_complete::TEXT,
         c.days_remaining, c.clock_rag,
         c.final_boq_signed, c.final_3d_signed, c.gfc_signed_by_client,
         c.bom_shared, c.triangle_complete,
         wi.id AS approval_instance_id, wi.status AS approval_status,
         wi.current_step AS approval_step,
         (SELECT COUNT(*)::INT FROM portal.workflow_steps s
           WHERE s.workflow_code = wi.workflow_code) AS approval_total_steps,
         ws.name AS approval_step_name, ws.approver_hint AS approval_hint
  FROM ee.pio_factory_clock c
  LEFT JOIN LATERAL (
    SELECT i.* FROM portal.workflow_instances i
    WHERE i.resource_type = 'pio' AND i.resource_id = c.id
    ORDER BY i.started_at DESC
    LIMIT 1
  ) wi ON TRUE
  LEFT JOIN portal.workflow_steps ws
    ON ws.workflow_code = wi.workflow_code AND ws.step_no = wi.current_step`;

/** Live PIOs on the factory clock with Triangle + approval state (RLS-scoped). */
export async function listPios(user: SessionUser): Promise<Pio[]> {
  await requirePermission(user, "read", "pio");
  return withUserContext(user, async (q) => {
    const rows = await q<PioRow>(
      `${PIO_SELECT} ORDER BY c.days_remaining ASC NULLS LAST`,
    );
    return rows.map(toPio);
  });
}

export async function updateTriangle(
  user: SessionUser,
  pioId: string,
  patch: {
    finalBoqSigned?: boolean;
    final3dSigned?: boolean;
    gfcSignedByClient?: boolean;
    bomShared?: boolean;
  },
): Promise<Pio> {
  await requirePermission(user, "edit", "pio");

  const columnPatch: Record<string, boolean> = {};
  if (patch.finalBoqSigned !== undefined) columnPatch.final_boq_signed = patch.finalBoqSigned;
  if (patch.final3dSigned !== undefined) columnPatch.final_3d_signed = patch.final3dSigned;
  if (patch.gfcSignedByClient !== undefined) columnPatch.gfc_signed_by_client = patch.gfcSignedByClient;
  if (patch.bomShared !== undefined) columnPatch.bom_shared = patch.bomShared;
  if (Object.keys(columnPatch).length === 0) {
    throw new ConflictError("Nothing to update");
  }

  const updated = await withUserContext(user, async (q) => {
    const [existing] = await q<{ id: string; pio_number: string }>(
      `SELECT p.id, p.pio_number
       FROM ee.pio p JOIN ee.projects pr ON pr.id = p.project_id
       WHERE p.id = $1`,
      [pioId],
    );
    if (!existing) throw new NotFoundError("PIO not found or not visible to you");

    const sets: string[] = [];
    const params: unknown[] = [pioId];
    for (const [column, value] of Object.entries(columnPatch)) {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    }
    sets.push("updated_at = NOW()");
    await q(`UPDATE ee.pio SET ${sets.join(", ")} WHERE id = $1`, params);

    const [row] = await q<PioRow>(`${PIO_SELECT} WHERE c.id = $1`, [pioId]);
    if (!row) throw new NotFoundError("PIO left the factory clock");
    return toPio(row);
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "PIO_TRIANGLE_UPDATE",
    resourceType: "pio",
    resourceId: pioId,
    newValues: patch,
  });
  return updated;
}

/**
 * The §29 gate: a PIO goes to the approval chain only when the Triangle of
 * Agreement is complete — all four, no exceptions, exact refusal message.
 */
export async function requestPioApproval(
  user: SessionUser,
  pioId: string,
): Promise<Pio> {
  await requirePermission(user, "edit", "pio");

  const pio = await withUserContext(user, async (q) => {
    const [row] = await q<{
      id: string;
      pio_number: string;
      final_boq_signed: boolean;
      final_3d_signed: boolean;
      gfc_signed_by_client: boolean;
      bom_shared: boolean;
    }>(
      `SELECT p.id, p.pio_number, p.final_boq_signed, p.final_3d_signed,
              p.gfc_signed_by_client, p.bom_shared
       FROM ee.pio p JOIN ee.projects pr ON pr.id = p.project_id
       WHERE p.id = $1`,
      [pioId],
    );
    if (!row) throw new NotFoundError("PIO not found or not visible to you");
    return row;
  });

  const missing = Object.entries({
    final_boq_signed: pio.final_boq_signed,
    final_3d_signed: pio.final_3d_signed,
    gfc_signed_by_client: pio.gfc_signed_by_client,
    bom_shared: pio.bom_shared,
  })
    .filter(([, done]) => !done)
    .map(([key]) => TRIANGLE_LABELS[key]);
  if (missing.length > 0) {
    throw new BlockingRuleError(
      `${pio.pio_number} cannot go for approval — Triangle of Agreement ` +
        `incomplete: ${missing.join(" + ")} pending. BOQ, 3D, client-signed ` +
        `GFC and shared BOM must all align before factory release ` +
        `(Brief §29 — the Triangle check).`,
    );
  }

  // The workflow engine owns the chain from here (409 if already pending).
  await startWorkflow(user, "pio_approval", "pio", pioId);

  const [refreshed] = await withUserContext(user, (q) =>
    q<PioRow>(`${PIO_SELECT} WHERE c.id = $1`, [pioId]),
  );
  if (!refreshed) throw new NotFoundError("PIO left the factory clock");
  return toPio(refreshed);
}
