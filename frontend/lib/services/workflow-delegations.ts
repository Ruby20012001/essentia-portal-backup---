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
 * Every delegation in the organisation — the admin Active Delegations view.
 * listDelegations() is deliberately scoped to the caller; this is the org-wide
 * read, so the CALLER must gate it (assign:workflows / leadership) before use.
 * Read-only.
 */
export async function listAllDelegations(): Promise<Array<Record<string, unknown>>> {
  return query<Record<string, unknown>>(
    `SELECT wd.id, wd.delegator_id, du.full_name AS delegator_name,
            wd.delegate_id, de.full_name AS delegate_name,
            wd.from_date, wd.to_date, wd.definition_code, wd.reason,
            d.name AS definition_name,
            wd.revoked_at, wd.expired_at, wd.created_at,
            (wd.revoked_at IS NULL AND wd.from_date <= CURRENT_DATE AND wd.to_date >= CURRENT_DATE) AS active
     FROM portal.workflow_delegations wd
     JOIN public.users du ON du.id = wd.delegator_id
     JOIN public.users de ON de.id = wd.delegate_id
     LEFT JOIN portal.workflow_definitions d ON d.code = wd.definition_code
     ORDER BY (wd.revoked_at IS NULL AND wd.to_date >= CURRENT_DATE) DESC, wd.created_at DESC`,
  );
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
