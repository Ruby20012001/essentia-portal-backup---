import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/notifications";
import { evaluateCondition } from "@/lib/services/workflow-conditions";
import { resolveDelegateChain } from "@/lib/services/workflow-delegations";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow engine — approval chains as data (WES v1.0). A definition is an
 * ordered set of GROUPS (portal.workflow_groups); each group holds one or more
 * approver specs (portal.workflow_group_approvers) and a quorum. At runtime the
 * engine materializes per-approver TASKS (portal.workflow_tasks) for the
 * current group; a decision is a compare-and-swap on the task, and the group
 * completes when `quorum` tasks are approved. Groups advance in sequence.
 *
 * The PIO chain (Khushpreet → Deepak Ji → Hardesh, §26) is 3 groups × 1
 * approver, quorum 1 — so it behaves exactly as the previous step chain
 * (ADR-WE-010). `current_step` on the instance is the current group index; the
 * legacy workflow_steps table is retained during the transition and still backs
 * the notification recipient strategy (WES §17).
 *
 * Concurrency (ADR-WE-003): every state change is a single conditional UPDATE
 * (CAS) — a losing concurrent decision matches zero rows and is refused (409).
 * A 'user' approver not yet mapped to an account (pre-Keka) has no task; acting
 * on such a group is refused, naming the intended approver.
 */

export type WorkflowStatus = "pending" | "approved" | "rejected" | "cancelled";

export type WorkflowInstance = {
  id: string;
  workflowCode: string;
  workflowName: string;
  resourceType: string;
  resourceId: string;
  status: WorkflowStatus;
  currentStep: number; // current group index
  totalSteps: number; // total groups
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

type GroupRow = {
  group_no: number;
  name: string;
  quorum: number;
  reject_policy: "fail_fast" | "continue";
  condition: unknown; // restricted predicate (WES §7); null = always run
  sla_hours: number | null;
  warn_hours: number | null;
  timeout_hours: number | null;
  timeout_action: "auto_approve" | "auto_reject" | "escalate" | null;
  reminder_hours: number | null;
};

type ApproverRow = {
  approver_type: "user" | "access_level" | "role" | "dynamic";
  approver_user_id: string | null;
  approver_level: SessionUser["accessLevel"] | null;
  approver_ref: string | null; // email (user) / role code / resolver key
  approver_hint: string | null;
};

const GROUPS_SQL = `
  SELECT group_no, name, quorum, reject_policy, condition,
         sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours
  FROM portal.workflow_groups
  WHERE definition_code = $1
  ORDER BY group_no`;

const APPROVERS_SQL = `
  SELECT ga.approver_type, ga.approver_user_id, ga.approver_level,
         ga.approver_ref, ga.approver_hint
  FROM portal.workflow_group_approvers ga
  JOIN portal.workflow_groups g ON g.id = ga.group_id
  WHERE g.definition_code = $1 AND g.group_no = $2
  ORDER BY ga.sort_order`;

/** Resolve a 'user' approver spec to a concrete active user id, or null. */
async function resolveUserApprover(a: ApproverRow): Promise<string | null> {
  if (a.approver_user_id) return a.approver_user_id;
  if (a.approver_ref) {
    const [u] = await query<{ id: string }>(
      `SELECT id FROM public.users WHERE lower(email) = lower($1) AND is_active`,
      [a.approver_ref],
    );
    return u?.id ?? null;
  }
  return null;
}

/**
 * Materialize the resolvable 'user' tasks for a group (idempotent), setting the
 * SLA / warning / timeout deadlines from the group's config (WES §8). Reminder
 * cadence is derived from assigned_at + reminder_hours by the timer sweep.
 */
async function materializeGroupTasks(
  instanceId: string,
  workflowCode: string,
  group: GroupRow,
): Promise<void> {
  const approvers = await query<ApproverRow>(APPROVERS_SQL, [workflowCode, group.group_no]);
  const now = Date.now();
  const at = (h: number | null): string | null =>
    h ? new Date(now + h * 3_600_000).toISOString() : null;
  for (const a of approvers) {
    if (a.approver_type !== "user") continue; // level/role/dynamic resolve at act-time
    const uid = await resolveUserApprover(a);
    if (!uid) continue; // unresolved → no task; act-time refuses, naming the person
    // Standing delegation (out-of-office): the delegate becomes the effective
    // approver; the original assignee is preserved (WES §9).
    const { effective } = await resolveDelegateChain(uid, workflowCode);
    await query(
      `INSERT INTO portal.workflow_tasks
         (instance_id, group_no, assignee_user_id, delegated_to_user_id,
          sla_due_at, warn_at, timeout_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::timestamptz)
       ON CONFLICT (instance_id, group_no, assignee_user_id) DO NOTHING`,
      [instanceId, group.group_no, uid, effective !== uid ? effective : null,
       at(group.sla_hours), at(group.warn_hours), at(group.timeout_hours)],
    );
  }
}

/**
 * Pure: the next APPLICABLE group after `afterGroupNo` (its condition is true
 * against `context`), plus the groups skipped to reach it. Groups arrive
 * pre-ordered by group_no. A null condition always applies (WES §7).
 */
function planNext(
  groups: GroupRow[],
  context: Record<string, unknown>,
  afterGroupNo: number,
): { next: GroupRow | null; skipped: GroupRow[] } {
  const skipped: GroupRow[] = [];
  for (const g of groups) {
    if (g.group_no <= afterGroupNo) continue;
    if (evaluateCondition(context, g.condition)) return { next: g, skipped };
    skipped.push(g);
  }
  return { next: null, skipped };
}

async function auditSkip(
  user: SessionUser,
  instanceId: string,
  resourceType: string,
  resourceId: string,
  group: GroupRow,
): Promise<void> {
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_SKIP_GROUP",
    resourceType,
    resourceId,
    newValues: { instanceId, groupNo: group.group_no, groupName: group.name, reason: "condition false" },
  });
}

export async function startWorkflow(
  user: SessionUser,
  workflowCode: string,
  resourceType: string,
  resourceId: string,
  context: Record<string, unknown> = {},
): Promise<string> {
  const [definition] = await query<{ code: string; name: string }>(
    `SELECT code, name FROM portal.workflow_definitions WHERE code = $1 AND is_active`,
    [workflowCode],
  );
  if (!definition) {
    throw new WorkflowError(`Unknown or inactive workflow '${workflowCode}'`, 404);
  }
  const groups = await query<GroupRow>(GROUPS_SQL, [workflowCode]);
  if (groups.length === 0) {
    throw new WorkflowError(`Workflow '${workflowCode}' has no groups configured`);
  }

  let instanceId: string;
  try {
    const [row] = await query<{ id: string }>(
      `INSERT INTO portal.workflow_instances
         (workflow_code, resource_type, resource_id, started_by, context)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [workflowCode, resourceType, resourceId, user.id, JSON.stringify(context)],
    );
    instanceId = row!.id;
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

  // Activate the first APPLICABLE group — groups whose condition is false
  // against the context are skipped (conditional routing, WES §7).
  const plan = planNext(groups, context, 0);
  for (const s of plan.skipped) await auditSkip(user, instanceId, resourceType, resourceId, s);
  if (!plan.next) {
    // Every group was skipped → nothing to approve; the instance is approved.
    await query(
      `UPDATE portal.workflow_instances SET status = 'approved', completed_at = NOW() WHERE id = $1`,
      [instanceId],
    );
    await publishEvent({
      type: "workflow.approved",
      category: "approval",
      entityType: resourceType,
      entityId: resourceId,
      actorId: user.id,
      payload: {
        instanceId,
        workflowName: definition.name,
        resourceRef: `${resourceType} ${resourceId}`,
        actor: user.name,
        stepNo: 0,
        commentsLine: "",
        actionUrl: "/wio-pio",
      },
    });
    return instanceId;
  }
  if (plan.next.group_no !== 1) {
    await query(
      `UPDATE portal.workflow_instances SET current_step = $2 WHERE id = $1`,
      [instanceId, plan.next.group_no],
    );
  }
  await materializeGroupTasks(instanceId, workflowCode, plan.next);
  await publishStepPending(instanceId, definition.name, plan.next, resourceType, resourceId);
  return instanceId;
}

export async function actOnWorkflow(
  user: SessionUser,
  instanceId: string,
  action: "approve" | "reject",
  comments?: string,
  systemTaskId?: string, // set for scheduler timeout auto-decisions; bypasses the approver check
): Promise<WorkflowInstance> {
  const [instance] = await query<{
    id: string;
    workflow_code: string;
    resource_type: string;
    resource_id: string;
    status: WorkflowStatus;
    current_step: number;
    context: Record<string, unknown> | null;
  }>(
    `SELECT id, workflow_code, resource_type, resource_id, status, current_step, context
     FROM portal.workflow_instances WHERE id = $1`,
    [instanceId],
  );
  if (!instance) throw new WorkflowError("Workflow instance not found", 404);
  if (instance.status !== "pending") {
    throw new WorkflowError(`This approval is already ${instance.status}`, 409);
  }

  const groups = await query<GroupRow>(GROUPS_SQL, [instance.workflow_code]);
  const group = groups.find((g) => g.group_no === instance.current_step);
  if (!group) throw new WorkflowError("Workflow group configuration is missing");
  const approvers = await query<ApproverRow>(APPROVERS_SQL, [
    instance.workflow_code,
    group.group_no,
  ]);

  // The acting user's pending task (exact-approver), or a system-supplied task
  // for scheduler timeout auto-decisions.
  const taskId = systemTaskId ?? (await resolveActingTask(user, instanceId, group, approvers));

  // Next applicable group (skipping any whose condition is false, WES §7).
  const plan = planNext(groups, instance.context ?? {}, group.group_no);
  const nextGroup = plan.next;

  const outcome = await withTransaction(async (q) => {
    // CAS on the TASK — a concurrent decision on the same task matches zero rows.
    const applied = await q<{ id: string }>(
      `UPDATE portal.workflow_tasks
       SET status = $2, acted_by = $3, acted_at = NOW(), comments = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING id`,
      [taskId, action === "approve" ? "approved" : "rejected", user.id, comments ?? null],
    );
    if (applied.length === 0) {
      throw new WorkflowError("This approval was already actioned", 409);
    }
    // task_id links the action to the exact task (parallel groups have several
    // actions at the same step_no); step_no is kept (= group number) for
    // backward-compat with the previous engine's record (migration 015).
    await q(
      `INSERT INTO portal.workflow_actions
         (instance_id, task_id, step_no, group_no, action, acted_by, comments)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [instanceId, taskId, group.group_no, group.group_no, action, user.id, comments ?? null],
    );

    // Rejection under fail_fast → instance rejected; open siblings skipped.
    if (action === "reject" && group.reject_policy === "fail_fast") {
      const rej = await q<{ id: string }>(
        `UPDATE portal.workflow_instances SET status = 'rejected', completed_at = NOW()
         WHERE id = $1 AND status = 'pending' AND current_step = $2 RETURNING id`,
        [instanceId, group.group_no],
      );
      if (rej.length === 0) throw new WorkflowError("This approval was already actioned", 409);
      await q(
        `UPDATE portal.workflow_tasks SET status = 'skipped'
         WHERE instance_id = $1 AND group_no = $2 AND status = 'pending'`,
        [instanceId, group.group_no],
      );
      return { nextStatus: "rejected" as WorkflowStatus, advanced: false };
    }

    // Quorum check.
    const [count] = await q<{ approved: number }>(
      `SELECT COUNT(*)::INT AS approved FROM portal.workflow_tasks
       WHERE instance_id = $1 AND group_no = $2 AND status = 'approved'`,
      [instanceId, group.group_no],
    );
    if ((count?.approved ?? 0) < group.quorum) {
      // Group still open (parallel groups await more approvals).
      return { nextStatus: "pending" as WorkflowStatus, advanced: false };
    }

    // Group complete → skip remaining pending siblings, then advance or finish.
    await q(
      `UPDATE portal.workflow_tasks SET status = 'skipped'
       WHERE instance_id = $1 AND group_no = $2 AND status = 'pending'`,
      [instanceId, group.group_no],
    );
    if (!nextGroup) {
      const done = await q<{ id: string }>(
        `UPDATE portal.workflow_instances SET status = 'approved', completed_at = NOW()
         WHERE id = $1 AND status = 'pending' AND current_step = $2 RETURNING id`,
        [instanceId, group.group_no],
      );
      if (done.length === 0) throw new WorkflowError("This approval was already actioned", 409);
      return { nextStatus: "approved" as WorkflowStatus, advanced: false };
    }
    const adv = await q<{ id: string }>(
      `UPDATE portal.workflow_instances SET current_step = $3
       WHERE id = $1 AND status = 'pending' AND current_step = $2 RETURNING id`,
      [instanceId, group.group_no, nextGroup.group_no],
    );
    if (adv.length === 0) throw new WorkflowError("This approval was already actioned", 409);
    return { nextStatus: "pending" as WorkflowStatus, advanced: true };
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: action === "approve" ? "WORKFLOW_APPROVE" : "WORKFLOW_REJECT",
    resourceType: instance.resource_type,
    resourceId: instance.resource_id,
    oldValues: { status: "pending", step: group.group_no },
    newValues: { instanceId, stepNo: group.group_no, status: outcome.nextStatus, comments },
  });

  const [definition] = await query<{ name: string }>(
    `SELECT name FROM portal.workflow_definitions WHERE code = $1`,
    [instance.workflow_code],
  );
  const workflowName = definition?.name ?? instance.workflow_code;

  if (outcome.advanced && nextGroup) {
    for (const s of plan.skipped) {
      await auditSkip(user, instanceId, instance.resource_type, instance.resource_id, s);
    }
    await materializeGroupTasks(instanceId, instance.workflow_code, nextGroup);
    await publishStepPending(
      instanceId,
      workflowName,
      nextGroup,
      instance.resource_type,
      instance.resource_id,
    );
  } else if (outcome.nextStatus === "approved" || outcome.nextStatus === "rejected") {
    await publishEvent({
      type: outcome.nextStatus === "approved" ? "workflow.approved" : "workflow.rejected",
      category: "approval",
      entityType: instance.resource_type,
      entityId: instance.resource_id,
      actorId: user.id,
      payload: {
        instanceId,
        workflowName,
        resourceRef: `${instance.resource_type} ${instance.resource_id}`,
        actor: user.name,
        stepNo: group.group_no,
        commentsLine: comments ? ` "${comments}"` : "",
        actionUrl: "/wio-pio",
      },
    });
  }

  const result = await getWorkflowInstance(instanceId);
  if (!result) throw new WorkflowError("Workflow instance disappeared", 500);
  return result;
}

/**
 * Find the acting user's pending task in the current group, or refuse with the
 * exact-approver error — preserving the previous engine's messages/statuses:
 * unresolved 'user' approver → 409 (names the person); level match with no task
 * → create one on the fly; otherwise not-yours → 403.
 */
async function resolveActingTask(
  user: SessionUser,
  instanceId: string,
  group: GroupRow,
  approvers: ApproverRow[],
): Promise<string> {
  // Only the EFFECTIVE approver (delegate if delegated, else the assignee) acts.
  const [task] = await query<{ id: string }>(
    `SELECT id FROM portal.workflow_tasks
     WHERE instance_id = $1 AND group_no = $2 AND status = 'pending'
       AND COALESCE(delegated_to_user_id, assignee_user_id) = $3`,
    [instanceId, group.group_no, user.id],
  );
  if (task) return task.id;

  // The acting user is the ORIGINAL approver of a task they delegated away.
  const [delegatedAway] = await query<{ id: string }>(
    `SELECT id FROM portal.workflow_tasks
     WHERE instance_id = $1 AND group_no = $2 AND status = 'pending'
       AND assignee_user_id = $3 AND delegated_to_user_id IS NOT NULL`,
    [instanceId, group.group_no, user.id],
  );
  if (delegatedAway) {
    throw new WorkflowError(
      `Step ${group.group_no} (${group.name}) has been delegated — it is no longer yours to decide.`,
      403,
    );
  }

  // A level/role approver the acting user satisfies → materialize their task now.
  const levelMatch = approvers.some(
    (a) => a.approver_type === "access_level" && a.approver_level === user.accessLevel,
  );
  if (levelMatch) {
    const [created] = await query<{ id: string }>(
      `INSERT INTO portal.workflow_tasks (instance_id, group_no, assignee_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (instance_id, group_no, assignee_user_id) DO UPDATE SET status = 'pending'
       RETURNING id`,
      [instanceId, group.group_no, user.id],
    );
    return created!.id;
  }

  // No task for this user: is a 'user' approver in this group unresolved?
  for (const a of approvers.filter((x) => x.approver_type === "user")) {
    const uid = await resolveUserApprover(a);
    if (!uid) {
      throw new WorkflowError(
        `Step ${group.group_no} (${group.name}) is assigned to ` +
          `"${a.approver_hint ?? "an unmapped approver"}" who is not yet linked to a ` +
          "portal account — pending the Keka staff import.",
        409,
      );
    }
  }
  const hint = approvers[0]?.approver_hint ?? "the assigned approver";
  throw new WorkflowError(
    `Step ${group.group_no} (${group.name}) is not yours to decide — it belongs to ${hint}.`,
    403,
  );
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
            (SELECT COUNT(*)::INT FROM portal.workflow_groups g
              WHERE g.definition_code = i.workflow_code) AS total_steps,
            cg.name AS step_name,
            (SELECT ga.approver_hint FROM portal.workflow_group_approvers ga
              JOIN portal.workflow_groups g2 ON g2.id = ga.group_id
              WHERE g2.definition_code = i.workflow_code AND g2.group_no = i.current_step
              ORDER BY ga.sort_order LIMIT 1) AS approver_hint,
            i.started_at::TEXT, i.completed_at::TEXT
     FROM portal.workflow_instances i
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code
     LEFT JOIN portal.workflow_groups cg
       ON cg.definition_code = i.workflow_code AND cg.group_no = i.current_step
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
  group: GroupRow,
  resourceType: string,
  resourceId: string,
): Promise<void> {
  // Kept as workflow.step_pending during the transition: the existing
  // recipient strategy resolves the approver from workflow_steps by
  // current_step (= group_no). Step 9 moves notifications onto tasks.
  await publishEvent({
    type: "workflow.step_pending",
    category: "approval",
    entityType: resourceType,
    entityId: resourceId,
    payload: {
      instanceId,
      workflowName,
      stepNo: group.group_no,
      stepName: group.name,
      resourceRef: `${resourceType} ${resourceId}`,
      actionUrl: "/wio-pio",
    },
  });
}
