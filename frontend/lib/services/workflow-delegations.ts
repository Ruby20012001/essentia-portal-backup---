import { query } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { publishEvent } from "@/lib/notifications";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow delegation (WES §9). Two modes:
 *  - Standing (out-of-office): a workflow_delegations row; resolved automatically
 *    at task materialization so the delegate becomes the effective approver.
 *  - Ad-hoc (task): delegate a single pending task to another approver.
 *
 * Rules (MUST): no self-delegation, no cycles/loops, active users only, valid
 * (non-expired, non-revoked) window, no duplicate active delegation per scope.
 * Resolution always terminates (visited set + hop cap). Every delegation is
 * audited with both identities; events are published (never a direct send).
 */

const MAX_HOPS = 16;

/**
 * Resolve the effective approver for `userId` under an active standing
 * delegation chain (scoped to `definitionCode`, else global). Terminates on a
 * cycle, an inactive delegate, or no further delegation. Pure of side effects.
 */
export async function resolveDelegateChain(
  userId: string,
  definitionCode: string,
): Promise<{ effective: string; original: string; delegated: boolean }> {
  const visited = new Set<string>([userId]);
  let current = userId;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const [d] = await query<{ delegate_id: string }>(
      `SELECT wd.delegate_id
       FROM portal.workflow_delegations wd
       JOIN public.users u ON u.id = wd.delegate_id AND u.is_active
       WHERE wd.delegator_id = $1 AND wd.revoked_at IS NULL
         AND wd.from_date <= CURRENT_DATE AND wd.to_date >= CURRENT_DATE
         AND (wd.definition_code IS NULL OR wd.definition_code = $2)
       ORDER BY (wd.definition_code IS NOT NULL) DESC, wd.created_at DESC
       LIMIT 1`,
      [current, definitionCode],
    );
    if (!d) break; // no active delegation for `current`
    if (visited.has(d.delegate_id)) break; // cycle → stop, keep `current`
    visited.add(d.delegate_id);
    current = d.delegate_id;
  }
  return { effective: current, original: userId, delegated: current !== userId };
}

async function assertActiveUser(userId: string): Promise<SessionUser["name"] | null> {
  const [u] = await query<{ full_name: string }>(
    `SELECT full_name FROM public.users WHERE id = $1 AND is_active`,
    [userId],
  );
  return u?.full_name ?? null;
}

/** True if delegating delegator→delegate would create a cycle back to delegator. */
async function wouldCreateCycle(
  delegatorId: string,
  delegateId: string,
  definitionCode: string | null,
): Promise<boolean> {
  const visited = new Set<string>([delegatorId]);
  let current = delegateId;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (current === delegatorId) return true;
    if (visited.has(current)) return false;
    visited.add(current);
    const [d] = await query<{ delegate_id: string }>(
      `SELECT delegate_id FROM portal.workflow_delegations
       WHERE delegator_id = $1 AND revoked_at IS NULL
         AND to_date >= CURRENT_DATE
         AND (definition_code IS NULL OR definition_code = $2)
       ORDER BY (definition_code IS NOT NULL) DESC, created_at DESC LIMIT 1`,
      [current, definitionCode],
    );
    if (!d) return false;
    current = d.delegate_id;
  }
  return false;
}

export type CreateDelegationInput = {
  delegatorId?: string; // defaults to the acting user (self-delegation)
  delegateId: string;
  fromDate: string; // YYYY-MM-DD
  toDate: string;
  definitionCode?: string | null; // null = all workflows
  reason?: string;
};

/** Create a standing (out-of-office) delegation. */
export async function createDelegation(user: SessionUser, input: CreateDelegationInput) {
  const delegatorId = input.delegatorId ?? user.id;
  const definitionCode = input.definitionCode ?? null;

  // On behalf of someone else requires admin authority; self-delegation is allowed.
  if (delegatorId !== user.id) {
    await requirePermission(user, "assign", "workflows");
  }
  if (input.delegateId === delegatorId) {
    throw new BlockingRuleError("A user cannot delegate to themselves.");
  }
  if (input.fromDate > input.toDate) {
    throw new BlockingRuleError("Delegation from-date must be on or before the to-date.");
  }
  const delegateName = await assertActiveUser(input.delegateId);
  if (!delegateName) throw new NotFoundError("The delegate is not an active user.");
  if (!(await assertActiveUser(delegatorId))) {
    throw new NotFoundError("The delegator is not an active user.");
  }
  // One active delegation per (delegator, scope).
  const [dupe] = await query<{ id: string }>(
    `SELECT id FROM portal.workflow_delegations
     WHERE delegator_id = $1 AND revoked_at IS NULL AND to_date >= CURRENT_DATE
       AND definition_code IS NOT DISTINCT FROM $2`,
    [delegatorId, definitionCode],
  );
  if (dupe) throw new ConflictError("An active delegation already exists for this scope.");
  if (await wouldCreateCycle(delegatorId, input.delegateId, definitionCode)) {
    throw new BlockingRuleError("This delegation would create a delegation loop.");
  }

  const [row] = await query<{ id: string }>(
    `INSERT INTO portal.workflow_delegations
       (delegator_id, delegate_id, from_date, to_date, definition_code, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [delegatorId, input.delegateId, input.fromDate, input.toDate, definitionCode, input.reason ?? null, user.id],
  );

  await writeAudit({
    userId: user.id, role: user.accessLevel,
    action: "WORKFLOW_DELEGATION_CREATE", resourceType: "workflows", resourceId: row!.id,
    newValues: {
      delegationId: row!.id, delegatorId, delegateId: input.delegateId,
      fromDate: input.fromDate, toDate: input.toDate, definitionCode,
      reason: input.reason ?? null, delegatedBy: user.id,
    },
  });
  await publishEvent({
    type: "workflow.delegation_created", category: "approval",
    entityType: "workflow_delegation", entityId: row!.id, actorId: user.id,
    payload: {
      recipientId: input.delegateId,
      // The 'assignment' template titles on {{resourceRef}} — always supply it.
      resourceRef: definitionCode ?? "All workflows",
      summary: `You will receive ${definitionCode ?? "all"} workflow approvals delegated from ${delegatorId} (${input.fromDate}–${input.toDate}).`,
      actionUrl: "/wio-pio",
    },
  });
  return { id: row!.id };
}

/** Revoke a standing delegation (delegator or an admin). */
export async function revokeDelegation(user: SessionUser, delegationId: string) {
  const [d] = await query<{ delegator_id: string; delegate_id: string; revoked_at: string | null }>(
    `SELECT delegator_id, delegate_id, revoked_at FROM portal.workflow_delegations WHERE id = $1`,
    [delegationId],
  );
  if (!d) throw new NotFoundError("Delegation not found.");
  if (d.delegator_id !== user.id) await requirePermission(user, "assign", "workflows");
  if (d.revoked_at) throw new ConflictError("Delegation is already revoked.");

  const applied = await query<{ id: string }>(
    `UPDATE portal.workflow_delegations SET revoked_at = NOW()
     WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
    [delegationId],
  );
  if (applied.length === 0) throw new ConflictError("Delegation is already revoked.");

  await writeAudit({
    userId: user.id, role: user.accessLevel,
    action: "WORKFLOW_DELEGATION_REVOKE", resourceType: "workflows", resourceId: delegationId,
    oldValues: { revoked: false }, newValues: { delegationId, revokedBy: user.id },
  });
  await publishEvent({
    type: "workflow.delegation_revoked", category: "approval",
    entityType: "workflow_delegation", entityId: delegationId, actorId: user.id,
    payload: {
      recipientId: d.delegate_id,
      resourceRef: "Workflow delegation",
      summary: "A delegation to you has been revoked.",
      actionUrl: "/wio-pio",
    },
  });
  return { id: delegationId };
}

/**
 * Scheduler sweep (WES §9/§10) — stamp standing delegations whose window has
 * closed and tell both parties. Enforcement is NOT here: resolveDelegateChain
 * already refuses to resolve a delegation once CURRENT_DATE passes to_date, so
 * expiry is correct even if this job is late, disabled or fails. This makes an
 * ended delegation explicit (expired_at + notification) instead of merely
 * implied by a date comparison. Idempotent — a stamped row is never re-swept.
 */
export async function expireStandingDelegations(
  actor: SessionUser,
): Promise<{ expired: number }> {
  const due = await query<{ id: string; delegator_id: string; delegate_id: string; to_date: string }>(
    `UPDATE portal.workflow_delegations
     SET expired_at = NOW()
     WHERE revoked_at IS NULL AND expired_at IS NULL AND to_date < CURRENT_DATE
     RETURNING id, delegator_id, delegate_id, to_date::text AS to_date`,
  );

  for (const d of due) {
    await writeAudit({
      userId: actor.id,
      role: actor.accessLevel,
      action: "WORKFLOW_DELEGATION_EXPIRE",
      resourceType: "workflows",
      resourceId: d.id,
      oldValues: { expired: false },
      newValues: {
        delegationId: d.id,
        delegatorId: d.delegator_id,
        delegateId: d.delegate_id,
        toDate: d.to_date,
        expiredBy: actor.id,
      },
    });
    // Both parties are told: the delegate stops receiving, the delegator resumes.
    for (const recipientId of [d.delegate_id, d.delegator_id]) {
      await publishEvent({
        type: "workflow.delegation_expired",
        category: "approval",
        entityType: "workflow_delegation",
        entityId: d.id,
        actorId: actor.id,
        payload: {
          recipientId,
          resourceRef: "Workflow delegation",
          summary:
            recipientId === d.delegate_id
              ? `A workflow delegation to you ended on ${d.to_date}.`
              : `Your workflow delegation ended on ${d.to_date} — approvals return to you.`,
          actionUrl: "/approvals",
        },
        dedupeKey: `workflow.delegation_expired:${d.id}:${recipientId}`,
      });
    }
  }
  return { expired: due.length };
}

/** My delegations (as delegator or delegate). */
export async function listDelegations(user: SessionUser) {
  return query<Record<string, unknown>>(
    `SELECT wd.id, wd.delegator_id, du.full_name AS delegator_name,
            wd.delegate_id, de.full_name AS delegate_name,
            wd.from_date, wd.to_date, wd.definition_code, wd.reason,
            wd.revoked_at, wd.expired_at,
            (wd.revoked_at IS NULL AND wd.from_date <= CURRENT_DATE AND wd.to_date >= CURRENT_DATE) AS active
     FROM portal.workflow_delegations wd
     JOIN public.users du ON du.id = wd.delegator_id
     JOIN public.users de ON de.id = wd.delegate_id
     WHERE wd.delegator_id = $1 OR wd.delegate_id = $1
     ORDER BY wd.created_at DESC`,
    [user.id],
  );
}

/**
 * Lifecycle of a standing delegation, derived from existing timestamps only —
 * no stored status column, no new field. Precedence: an explicit revoke wins,
 * then expiry (stamped OR the window has passed), then a not-yet-started window,
 * else it is live.
 */
export type DelegationStatus = "active" | "scheduled" | "revoked" | "expired";

/** A row in the admin Active Delegations register (read-only). */
export type DelegationSummary = {
  id: string;
  type: "standing";
  delegatorId: string;
  delegatorName: string;
  delegatorDepartment: string | null;
  delegateId: string;
  delegateName: string;
  definitionCode: string | null;
  definitionName: string | null;
  scopeLabel: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  revokedAt: string | null;
  expiredAt: string | null;
  lastUpdated: string;
  status: DelegationStatus;
  pendingCount: number;
  /** The single pending affected instance, when there is exactly one; else null. */
  openInstanceId: string | null;
};

// Status + "last updated" are DERIVED in SQL from existing columns (WES §9); no
// status/updated_at is stored. Kept as a shared fragment so the list and the
// detail read compute them identically.
const STATUS_SQL = `CASE
    WHEN wd.revoked_at IS NOT NULL THEN 'revoked'
    WHEN wd.expired_at IS NOT NULL OR wd.to_date < CURRENT_DATE THEN 'expired'
    WHEN wd.from_date > CURRENT_DATE THEN 'scheduled'
    ELSE 'active'
  END`;
const LAST_UPDATED_SQL = `COALESCE(wd.revoked_at, wd.expired_at, wd.created_at)::text`;
// Order: live first, then scheduled, then closed (revoked/expired); newest within.
const STATUS_RANK_SQL = `CASE
    WHEN wd.revoked_at IS NOT NULL OR wd.expired_at IS NOT NULL OR wd.to_date < CURRENT_DATE THEN 2
    WHEN wd.from_date > CURRENT_DATE THEN 1
    ELSE 0
  END`;

type DelegationRow = {
  id: string;
  delegator_id: string;
  delegator_name: string;
  delegator_department: string | null;
  delegate_id: string;
  delegate_name: string;
  definition_code: string | null;
  definition_name: string | null;
  from_date: string;
  to_date: string;
  reason: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
  expired_at: string | null;
  last_updated: string;
  status: DelegationStatus;
  pending_count: number;
  one_instance_id: string | null;
};

function toSummary(r: DelegationRow): DelegationSummary {
  const pendingCount = Number(r.pending_count ?? 0);
  return {
    id: r.id,
    type: "standing",
    delegatorId: r.delegator_id,
    delegatorName: r.delegator_name,
    delegatorDepartment: r.delegator_department,
    delegateId: r.delegate_id,
    delegateName: r.delegate_name,
    definitionCode: r.definition_code,
    definitionName: r.definition_name,
    scopeLabel: r.definition_name ?? (r.definition_code ? r.definition_code : "All workflows"),
    fromDate: r.from_date,
    toDate: r.to_date,
    reason: r.reason,
    createdById: r.created_by,
    createdByName: r.created_by_name,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    expiredAt: r.expired_at,
    lastUpdated: r.last_updated,
    status: r.status,
    pendingCount,
    // "Open workflow" is only unambiguous when exactly one instance is pending.
    openInstanceId: pendingCount === 1 ? r.one_instance_id : null,
  };
}

/**
 * Every standing delegation in the organisation — the admin Active Delegations
 * register. listDelegations() is deliberately scoped to the caller; this is the
 * org-wide read, so the CALLER must gate it (assign:workflows / leadership)
 * before use. Read-only: it aggregates existing rows and derives status,
 * "last updated", and the pending-instance count from them — nothing is stored.
 */
export async function listAllDelegations(): Promise<DelegationSummary[]> {
  const rows = await query<DelegationRow>(
    `SELECT wd.id,
            wd.delegator_id, du.full_name AS delegator_name, ddep.name AS delegator_department,
            wd.delegate_id,  de.full_name AS delegate_name,
            wd.definition_code, d.name AS definition_name,
            wd.from_date::text AS from_date, wd.to_date::text AS to_date,
            wd.reason,
            wd.created_by, cb.full_name AS created_by_name,
            wd.created_at::text AS created_at,
            wd.revoked_at::text AS revoked_at, wd.expired_at::text AS expired_at,
            ${LAST_UPDATED_SQL} AS last_updated,
            ${STATUS_SQL} AS status,
            pend.n AS pending_count, pend.one_id AS one_instance_id
     FROM portal.workflow_delegations wd
     JOIN public.users du ON du.id = wd.delegator_id
     JOIN public.users de ON de.id = wd.delegate_id
     LEFT JOIN public.departments ddep ON ddep.id = du.department_id
     LEFT JOIN public.users cb ON cb.id = wd.created_by
     LEFT JOIN portal.workflow_definitions d ON d.code = wd.definition_code
     LEFT JOIN LATERAL (
       SELECT COUNT(DISTINCT t.instance_id)::int AS n, MIN(t.instance_id::text) AS one_id
       FROM portal.workflow_tasks t
       JOIN portal.workflow_instances i ON i.id = t.instance_id
       WHERE t.assignee_user_id = wd.delegator_id
         AND t.delegated_to_user_id = wd.delegate_id
         AND t.status = 'pending' AND i.status = 'pending'
         AND (wd.definition_code IS NULL OR i.workflow_code = wd.definition_code)
     ) pend ON TRUE
     ORDER BY ${STATUS_RANK_SQL}, wd.created_at DESC`,
  );
  return rows.map(toSummary);
}

export type DelegationTask = {
  instanceId: string;
  workflowCode: string;
  workflowName: string | null;
  resourceType: string;
  groupNo: number;
  taskStatus: string;
  instanceStatus: string;
  assignedAt: string;
  slaDueAt: string | null;
};

export type DelegationAuditEntry = { at: string; action: string; actor: string | null; detail: string | null };
export type DelegationNotification = {
  at: string;
  eventType: string;
  recipient: string | null;
  channel: string | null;
  status: string | null;
};

export type DelegationDetail = DelegationSummary & {
  delegateDepartment: string | null;
  tasksAffected: DelegationTask[];
  pendingApprovals: DelegationTask[];
  audit: DelegationAuditEntry[];
  notifications: DelegationNotification[];
};

function humanizeDelegationAction(action: string): string {
  if (action === "WORKFLOW_DELEGATION_CREATE") return "Delegation created";
  if (action === "WORKFLOW_DELEGATION_REVOKE") return "Delegation revoked";
  if (action === "WORKFLOW_DELEGATION_EXPIRE") return "Delegation expired";
  return action.replace(/^WORKFLOW_/, "").replace(/_/g, " ").toLowerCase();
}

/**
 * One standing delegation, fully expanded for the admin detail drawer. READ-ONLY
 * and purely aggregative — it joins existing rows and derives everything:
 *   - tasks affected / pending approvals  ← workflow_tasks stamped by this
 *       delegation (assignee = delegator, delegated_to = delegate, in scope)
 *   - audit history                       ← audit.log rows keyed to the delegation id
 *   - notification history                ← events (entity = this delegation) → deliveries
 * Nothing is copied into a new table and no new field is stored. Returns null if
 * the delegation does not exist. The CALLER must gate (assign:workflows).
 */
export async function getDelegationDetail(id: string): Promise<DelegationDetail | null> {
  const [core] = await query<DelegationRow & { delegate_department: string | null }>(
    `SELECT wd.id,
            wd.delegator_id, du.full_name AS delegator_name, ddep.name AS delegator_department,
            wd.delegate_id,  de.full_name AS delegate_name,  edep.name AS delegate_department,
            wd.definition_code, d.name AS definition_name,
            wd.from_date::text AS from_date, wd.to_date::text AS to_date,
            wd.reason,
            wd.created_by, cb.full_name AS created_by_name,
            wd.created_at::text AS created_at,
            wd.revoked_at::text AS revoked_at, wd.expired_at::text AS expired_at,
            ${LAST_UPDATED_SQL} AS last_updated,
            ${STATUS_SQL} AS status,
            0 AS pending_count, NULL AS one_instance_id
     FROM portal.workflow_delegations wd
     JOIN public.users du ON du.id = wd.delegator_id
     JOIN public.users de ON de.id = wd.delegate_id
     LEFT JOIN public.departments ddep ON ddep.id = du.department_id
     LEFT JOIN public.departments edep ON edep.id = de.department_id
     LEFT JOIN public.users cb ON cb.id = wd.created_by
     LEFT JOIN portal.workflow_definitions d ON d.code = wd.definition_code
     WHERE wd.id = $1`,
    [id],
  );
  if (!core) return null;

  // Tasks this delegation routed: the delegate stands in for the delegator, in
  // scope. Pending approvals are the live subset (task + instance still pending).
  const taskRows = await query<{
    instance_id: string;
    workflow_code: string;
    workflow_name: string | null;
    resource_type: string;
    group_no: number;
    task_status: string;
    instance_status: string;
    assigned_at: string;
    sla_due_at: string | null;
  }>(
    `SELECT t.instance_id, i.workflow_code, d.name AS workflow_name, i.resource_type,
            t.group_no, t.status AS task_status, i.status AS instance_status,
            t.assigned_at::text AS assigned_at, t.sla_due_at::text AS sla_due_at
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id
     LEFT JOIN portal.workflow_definitions d ON d.code = i.workflow_code
     WHERE t.assignee_user_id = $1 AND t.delegated_to_user_id = $2
       AND ($3::text IS NULL OR i.workflow_code = $3)
     ORDER BY t.assigned_at DESC`,
    [core.delegator_id, core.delegate_id, core.definition_code],
  );
  const tasksAffected: DelegationTask[] = taskRows.map((t) => ({
    instanceId: t.instance_id,
    workflowCode: t.workflow_code,
    workflowName: t.workflow_name,
    resourceType: t.resource_type,
    groupNo: t.group_no,
    taskStatus: t.task_status,
    instanceStatus: t.instance_status,
    assignedAt: t.assigned_at,
    slaDueAt: t.sla_due_at,
  }));
  const pendingApprovals = tasksAffected.filter(
    (t) => t.taskStatus === "pending" && t.instanceStatus === "pending",
  );
  const pendingInstances = [...new Set(pendingApprovals.map((t) => t.instanceId))];

  const auditRows = await query<{ action: string; at: string; actor: string | null }>(
    `SELECT l.action, l.created_at::text AS at, u.full_name AS actor
     FROM audit.log l
     LEFT JOIN public.users u ON u.id = l.user_id
     WHERE l.resource_type = 'workflows' AND l.resource_id::text = $1
       AND l.action LIKE 'WORKFLOW\\_DELEGATION%'
     ORDER BY l.created_at DESC`,
    [id],
  );
  const audit: DelegationAuditEntry[] = auditRows.map((a) => ({
    at: a.at,
    action: humanizeDelegationAction(a.action),
    actor: a.actor,
    detail: null,
  }));

  const notifRows = await query<{
    event_type: string;
    at: string;
    recipient: string | null;
    channel: string | null;
    status: string | null;
  }>(
    `SELECT e.event_type, nd.created_at::text AS at, r.full_name AS recipient,
            nd.channel, nd.status
     FROM portal.events e
     JOIN portal.notification_deliveries nd ON nd.event_id = e.id
     LEFT JOIN public.users r ON r.id = nd.recipient_id
     WHERE e.entity_type = 'workflow_delegation' AND e.entity_id::text = $1
     ORDER BY nd.created_at DESC`,
    [id],
  );
  const notifications: DelegationNotification[] = notifRows.map((n) => ({
    at: n.at,
    eventType: n.event_type.replace(/^workflow\./, "").replace(/_/g, " "),
    recipient: n.recipient,
    channel: n.channel,
    status: n.status,
  }));

  const summary = toSummary({
    ...core,
    pending_count: pendingApprovals.length,
    one_instance_id: pendingInstances[0] ?? null,
  });

  return {
    ...summary,
    // A standing delegation points at one instance only when exactly one is live.
    openInstanceId: pendingInstances.length === 1 ? pendingInstances[0]! : null,
    delegateDepartment: core.delegate_department,
    tasksAffected,
    pendingApprovals,
    audit,
    notifications,
  };
}

/**
 * Ad-hoc: delegate the acting user's pending task in a workflow instance to
 * another active approver. Only the current effective approver may delegate it.
 */
export async function delegateTask(
  user: SessionUser,
  instanceId: string,
  toUserId: string,
  reason?: string,
) {
  if (toUserId === user.id) throw new BlockingRuleError("A task cannot be delegated to yourself.");
  const delegateName = await assertActiveUser(toUserId);
  if (!delegateName) throw new NotFoundError("The delegate is not an active user.");

  // The acting user's current pending task (they must be the effective approver).
  const [task] = await query<{ id: string; group_no: number; resource_type: string; resource_id: string }>(
    `SELECT t.id, t.group_no, i.resource_type, i.resource_id
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id
     WHERE t.instance_id = $1 AND t.status = 'pending'
       AND COALESCE(t.delegated_to_user_id, t.assignee_user_id) = $2
       AND i.status = 'pending'`,
    [instanceId, user.id],
  );
  if (!task) throw new NotFoundError("You have no pending task to delegate on this workflow.");

  // Delegating to someone who delegates back would loop.
  if (await wouldCreateCycle(user.id, toUserId, null)) {
    throw new BlockingRuleError("This delegation would create a delegation loop.");
  }

  const applied = await query<{ id: string }>(
    `UPDATE portal.workflow_tasks SET delegated_to_user_id = $2
     WHERE id = $1 AND status = 'pending' RETURNING id`,
    [task.id, toUserId],
  );
  if (applied.length === 0) throw new ConflictError("This task was already actioned.");

  await writeAudit({
    userId: user.id, role: user.accessLevel,
    action: "WORKFLOW_TASK_DELEGATE", resourceType: task.resource_type, resourceId: task.resource_id,
    newValues: {
      instanceId, taskId: task.id, groupNo: task.group_no,
      originalApprover: user.id, effectiveApprover: toUserId, delegatedBy: user.id, reason: reason ?? null,
    },
  });
  await publishEvent({
    type: "workflow.task_delegated", category: "approval",
    entityType: task.resource_type, entityId: task.resource_id, actorId: user.id,
    payload: {
      instanceId, taskId: task.id, recipientId: toUserId,
      resourceRef: "Workflow approval",
      summary: `A workflow approval was delegated to you.${reason ? ` (${reason})` : ""}`,
      actionUrl: "/wio-pio",
    },
  });
  return { taskId: task.id, effectiveApprover: toUserId };
}
