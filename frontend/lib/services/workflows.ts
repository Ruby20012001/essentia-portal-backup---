import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/notifications";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow engine — approval chains as data (portal.workflow_definitions /
 * steps / instances / actions). The PIO chain (Khushpreet → Deepak Ji →
 * Hardesh, Brief §26) is seeded in db/004. Chains change by editing rows.
 *
 * Concurrency: the decision is applied as a single conditional UPDATE
 * (compare-and-swap on status + current_step). Two simultaneous decisions
 * race on that one statement — exactly one wins; the loser matches zero rows
 * and is refused. Duplicate starts are blocked by a partial unique index.
 *
 * A step whose approver is not yet mapped to a user account (pre-Keka
 * import) REFUSES to advance — nobody approves through an unresolved step;
 * the error names the intended approver from approver_hint.
 */

export type WorkflowStatus = "pending" | "approved" | "rejected" | "cancelled";

export type WorkflowInstance = {
  id: string;
  workflowCode: string;
  workflowName: string;
  resourceType: string;
  resourceId: string;
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  currentStepName: string | null;
  currentApproverHint: string | null;
  startedAt: string;
  completedAt: string | null;
};

export class WorkflowError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "WorkflowError";
    this.status = status;
  }
}

type StepRow = {
  step_no: number;
  name: string;
  approver_type: "user" | "access_level";
  approver_user_id: string | null;
  approver_level: SessionUser["accessLevel"] | null;
  approver_hint: string | null;
};

const STEPS_SQL = `
  SELECT step_no, name, approver_type, approver_user_id, approver_level, approver_hint
  FROM portal.workflow_steps
  WHERE workflow_code = $1
  ORDER BY step_no`;

export async function startWorkflow(
  user: SessionUser,
  workflowCode: string,
  resourceType: string,
  resourceId: string,
): Promise<string> {
  const [definition] = await query<{ code: string; name: string }>(
    `SELECT code, name FROM portal.workflow_definitions WHERE code = $1 AND is_active`,
    [workflowCode],
  );
  if (!definition) {
    throw new WorkflowError(`Unknown or inactive workflow '${workflowCode}'`, 404);
  }
  const steps = await query<StepRow>(STEPS_SQL, [workflowCode]);
  if (steps.length === 0) {
    throw new WorkflowError(`Workflow '${workflowCode}' has no steps configured`);
  }

  let instanceId: string;
  try {
    const [row] = await query<{ id: string }>(
      `INSERT INTO portal.workflow_instances
         (workflow_code, resource_type, resource_id, started_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [workflowCode, resourceType, resourceId, user.id],
    );
    instanceId = row.id;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new WorkflowError(
        `An approval for this ${resourceType} is already pending`,
        409,
      );
    }
    throw error;
  }

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_START",
    resourceType,
    resourceId,
    newValues: { workflowCode, instanceId },
  });
  await publishStepPending(instanceId, definition.name, steps[0], resourceType, resourceId);
  return instanceId;
}

export async function actOnWorkflow(
  user: SessionUser,
  instanceId: string,
  action: "approve" | "reject",
  comments?: string,
): Promise<WorkflowInstance> {
  // Read current state (no lock), validate the approver, then apply the
  // decision as a compare-and-swap guarded on (status, current_step).
  const [instance] = await query<{
    id: string;
    workflow_code: string;
    resource_type: string;
    resource_id: string;
    status: WorkflowStatus;
    current_step: number;
    started_by: string | null;
  }>(
    `SELECT id, workflow_code, resource_type, resource_id, status,
            current_step, started_by
     FROM portal.workflow_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance) throw new WorkflowError("Workflow instance not found", 404);
  if (instance.status !== "pending") {
    throw new WorkflowError(`This approval is already ${instance.status}`, 409);
  }

  const steps = await query<StepRow>(STEPS_SQL, [instance.workflow_code]);
  const step = steps.find((s) => s.step_no === instance.current_step);
  if (!step) throw new WorkflowError("Workflow step configuration is missing");

  // Approver resolution — exact match only; nobody bypasses the chain.
  if (step.approver_type === "user") {
    if (!step.approver_user_id) {
      throw new WorkflowError(
        `Step ${step.step_no} (${step.name}) is assigned to ` +
          `"${step.approver_hint ?? "an unmapped approver"}" who is not yet ` +
          "linked to a portal account — pending the Keka staff import.",
        409,
      );
    }
    if (step.approver_user_id !== user.id) {
      throw new WorkflowError(
        `Step ${step.step_no} (${step.name}) is not yours to decide — it ` +
          `belongs to ${step.approver_hint ?? "the assigned approver"}.`,
        403,
      );
    }
  } else if (step.approver_level !== user.accessLevel) {
    throw new WorkflowError(
      `Step ${step.step_no} (${step.name}) requires access level ${step.approver_level}`,
      403,
    );
  }

  const isFinalStep = instance.current_step >= steps.length;
  const nextStatus: WorkflowStatus =
    action === "reject" ? "rejected" : isFinalStep ? "approved" : "pending";
  const nextStep =
    action === "approve" && !isFinalStep
      ? instance.current_step + 1
      : instance.current_step;

  const outcome = await withTransaction(async (q) => {
    // CAS: only transitions if still pending at the step we validated. A
    // concurrent decision that already moved it matches zero rows → 409.
    // $4 is a distinct boolean param — do NOT reuse $2 in the CASE, or the
    // planner deduces inconsistent types for $2 ("status = $2" vs
    // "$2 = 'pending'") and the statement fails.
    const applied = await q<{ id: string }>(
      `UPDATE portal.workflow_instances
       SET status = $2, current_step = $3,
           completed_at = CASE WHEN $4::boolean THEN NOW() ELSE NULL END
       WHERE id = $1 AND status = 'pending' AND current_step = $5
       RETURNING id`,
      [instanceId, nextStatus, nextStep, nextStatus !== "pending", instance.current_step],
    );
    if (applied.length === 0) {
      throw new WorkflowError("This approval was already actioned", 409);
    }
    await q(
      `INSERT INTO portal.workflow_actions (instance_id, step_no, action, acted_by, comments)
       VALUES ($1, $2, $3, $4, $5)`,
      [instanceId, step.step_no, action, user.id, comments ?? null],
    );
    return { instance, step, steps, nextStatus, nextStep };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: action === "approve" ? "WORKFLOW_APPROVE" : "WORKFLOW_REJECT",
    resourceType: outcome.instance.resource_type,
    resourceId: outcome.instance.resource_id,
    oldValues: { status: "pending", step: outcome.instance.current_step },
    newValues: {
      instanceId,
      stepNo: outcome.step.step_no,
      status: outcome.nextStatus,
      comments,
    },
  });

  const [definition] = await query<{ name: string }>(
    `SELECT name FROM portal.workflow_definitions WHERE code = $1`,
    [outcome.instance.workflow_code],
  );
  const workflowName = definition?.name ?? outcome.instance.workflow_code;
  const resourceRef = `${outcome.instance.resource_type} ${outcome.instance.resource_id}`;

  if (outcome.nextStatus === "pending") {
    const next = outcome.steps.find((s) => s.step_no === outcome.nextStep);
    if (next) {
      await publishStepPending(
        instanceId,
        workflowName,
        next,
        outcome.instance.resource_type,
        outcome.instance.resource_id,
      );
    }
  } else {
    await publishEvent({
      type: outcome.nextStatus === "approved" ? "workflow.approved" : "workflow.rejected",
      category: "approval",
      entityType: outcome.instance.resource_type,
      entityId: outcome.instance.resource_id,
      actorId: user.id,
      payload: {
        instanceId,
        workflowName,
        resourceRef,
        actor: user.name,
        stepNo: outcome.step.step_no,
        commentsLine: comments ? ` "${comments}"` : "",
        actionUrl: "/wio-pio",
      },
    });
  }

  const result = await getWorkflowInstance(instanceId);
  if (!result) throw new WorkflowError("Workflow instance disappeared", 500);
  return result;
}

export async function getWorkflowInstance(
  instanceId: string,
): Promise<WorkflowInstance | null> {
  const [row] = await query<{
    id: string;
    workflow_code: string;
    workflow_name: string;
    resource_type: string;
    resource_id: string;
    status: WorkflowStatus;
    current_step: number;
    total_steps: number;
    step_name: string | null;
    approver_hint: string | null;
    started_at: string;
    completed_at: string | null;
  }>(
    `SELECT i.id, i.workflow_code, d.name AS workflow_name, i.resource_type,
            i.resource_id, i.status, i.current_step,
            (SELECT COUNT(*)::INT FROM portal.workflow_steps s
              WHERE s.workflow_code = i.workflow_code) AS total_steps,
            cs.name AS step_name, cs.approver_hint,
            i.started_at::TEXT, i.completed_at::TEXT
     FROM portal.workflow_instances i
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code
     LEFT JOIN portal.workflow_steps cs
       ON cs.workflow_code = i.workflow_code AND cs.step_no = i.current_step
     WHERE i.id = $1`,
    [instanceId],
  );
  if (!row) return null;
  return {
    id: row.id,
    workflowCode: row.workflow_code,
    workflowName: row.workflow_name,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    status: row.status,
    currentStep: row.current_step,
    totalSteps: row.total_steps,
    currentStepName: row.step_name,
    currentApproverHint: row.approver_hint,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

async function publishStepPending(
  instanceId: string,
  workflowName: string,
  step: StepRow,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  // Publish the domain event; the engine resolves the recipient from the
  // instance's current-step approver. If the approver is unresolved
  // (pre-Keka), that resolves to nobody and no delivery is made.
  await publishEvent({
    type: "workflow.step_pending",
    category: "approval",
    entityType: resourceType,
    entityId: resourceId,
    payload: {
      instanceId,
      workflowName,
      stepNo: step.step_no,
      stepName: step.name,
      resourceRef: `${resourceType} ${resourceId}`,
      actionUrl: "/wio-pio",
    },
  });
}
