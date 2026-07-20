import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Workflow definition administration (frontend screens 5 & 6).
 *
 * SAFETY MODEL. A definition is configuration for work that may be RUNNING, so:
 *   • Archive (is_active = FALSE) is the only removal. startWorkflow requires
 *     is_active, so archiving stops NEW instances while every running instance
 *     continues untouched. Nothing is ever hard-deleted — workflow_groups
 *     cascade from the definition, so a delete would sever running history.
 *   • Duplicate is the safe way to revise a live definition: copy, edit the
 *     copy, archive the original. The copy starts inactive so a half-built
 *     definition can never be started by accident.
 * Every mutation is permission-gated and audited.
 */

export type WorkflowDefinitionRow = {
  code: string;
  name: string;
  resourceType: string | null; // the "module" column in the UI
  description: string | null;
  isActive: boolean;
  groupCount: number;
  approverCount: number;
  runningCount: number; // live instances — why archiving must not delete
  createdAt: string;
  updatedAt: string | null;
};

/** Every definition with its shape and live usage. Read-only. */
export async function listWorkflowDefinitions(user: SessionUser): Promise<WorkflowDefinitionRow[]> {
  await requirePermission(user, "read", "workflows");
  return query<WorkflowDefinitionRow>(
    `SELECT d.code,
            d.name,
            d.resource_type AS "resourceType",
            d.description,
            d.is_active AS "isActive",
            COALESCE(g.n, 0)::int AS "groupCount",
            COALESCE(a.n, 0)::int AS "approverCount",
            COALESCE(r.n, 0)::int AS "runningCount",
            d.created_at::text AS "createdAt",
            d.updated_at::text AS "updatedAt"
     FROM portal.workflow_definitions d
     LEFT JOIN (
       SELECT definition_code, COUNT(*) AS n
       FROM portal.workflow_groups GROUP BY definition_code
     ) g ON g.definition_code = d.code
     LEFT JOIN (
       SELECT wg.definition_code, COUNT(*) AS n
       FROM portal.workflow_group_approvers ga
       JOIN portal.workflow_groups wg ON wg.id = ga.group_id
       GROUP BY wg.definition_code
     ) a ON a.definition_code = d.code
     LEFT JOIN (
       SELECT workflow_code, COUNT(*) AS n
       FROM portal.workflow_instances WHERE status = 'pending'
       GROUP BY workflow_code
     ) r ON r.workflow_code = d.code
     ORDER BY d.is_active DESC, d.name`,
  );
}

/** Archive: stop new instances. Running work is deliberately left alone. */
export async function archiveDefinition(user: SessionUser, code: string): Promise<{ code: string; runningCount: number }> {
  await requirePermission(user, "edit", "workflows");

  const [def] = await query<{ code: string; is_active: boolean }>(
    `SELECT code, is_active FROM portal.workflow_definitions WHERE code = $1`,
    [code],
  );
  if (!def) throw new NotFoundError("Workflow definition not found.");
  if (!def.is_active) throw new ConflictError("This workflow is already archived.");

  const [running] = await query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM portal.workflow_instances
     WHERE workflow_code = $1 AND status = 'pending'`,
    [code],
  );

  await query(
    `UPDATE portal.workflow_definitions SET is_active = FALSE, updated_at = NOW() WHERE code = $1`,
    [code],
  );
  await writeAudit({
    userId: user.id, role: user.accessLevel, action: "WORKFLOW_DEFINITION_ARCHIVE",
    resourceType: "workflows", resourceId: code,
    oldValues: { isActive: true },
    newValues: { code, isActive: false, runningInstancesLeftRunning: running?.n ?? 0 },
  });
  return { code, runningCount: running?.n ?? 0 };
}

/** Restore an archived definition so it can be started again. */
export async function restoreDefinition(user: SessionUser, code: string): Promise<{ code: string }> {
  await requirePermission(user, "edit", "workflows");

  const applied = await query<{ code: string }>(
    `UPDATE portal.workflow_definitions SET is_active = TRUE, updated_at = NOW()
     WHERE code = $1 AND is_active = FALSE RETURNING code`,
    [code],
  );
  if (applied.length === 0) {
    const [exists] = await query<{ code: string }>(
      `SELECT code FROM portal.workflow_definitions WHERE code = $1`,
      [code],
    );
    if (!exists) throw new NotFoundError("Workflow definition not found.");
    throw new ConflictError("This workflow is already active.");
  }
  await writeAudit({
    userId: user.id, role: user.accessLevel, action: "WORKFLOW_DEFINITION_RESTORE",
    resourceType: "workflows", resourceId: code,
    oldValues: { isActive: false }, newValues: { code, isActive: true },
  });
  return { code };
}

const CODE_PATTERN = /^[a-z0-9_]{3,50}$/;

/**
 * Deep-copy a definition (groups + approvers) under a new code. The copy is
 * created INACTIVE so a half-built definition cannot be started by accident.
 * One transaction: a partial copy would be a broken workflow.
 */
export async function duplicateDefinition(
  user: SessionUser,
  sourceCode: string,
  newCode: string,
  newName: string,
): Promise<{ code: string; groupsCopied: number; approversCopied: number }> {
  await requirePermission(user, "create", "workflows");

  if (!CODE_PATTERN.test(newCode)) {
    throw new BlockingRuleError(
      "A workflow code must be 3–50 characters, lower-case letters, numbers or underscores.",
    );
  }
  if (!newName.trim()) throw new BlockingRuleError("A workflow name is required.");

  const [source] = await query<{ code: string; resource_type: string | null; description: string | null }>(
    `SELECT code, resource_type, description FROM portal.workflow_definitions WHERE code = $1`,
    [sourceCode],
  );
  if (!source) throw new NotFoundError("Workflow definition not found.");

  const [clash] = await query<{ code: string }>(
    `SELECT code FROM portal.workflow_definitions WHERE code = $1`,
    [newCode],
  );
  if (clash) throw new ConflictError(`A workflow with the code '${newCode}' already exists.`);

  const copied = await withTransaction(async (q) => {
    await q(
      `INSERT INTO portal.workflow_definitions (code, name, resource_type, description, is_active, updated_at)
       VALUES ($1, $2, $3, $4, FALSE, NOW())`,
      [newCode, newName.trim(), source.resource_type, source.description],
    );

    // Groups keep their numbering; the new ids are what the approvers hang off.
    const groups = await q<{ old_id: string; new_id: string }>(
      `WITH src AS (
         SELECT id, group_no, name, quorum, reject_policy, condition,
                sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours
         FROM portal.workflow_groups WHERE definition_code = $1
       ), ins AS (
         INSERT INTO portal.workflow_groups
           (definition_code, group_no, name, quorum, reject_policy, condition,
            sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours)
         SELECT $2, group_no, name, quorum, reject_policy, condition,
                sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours
         FROM src
         RETURNING id, group_no
       )
       SELECT src.id AS old_id, ins.id AS new_id
       FROM ins JOIN src ON src.group_no = ins.group_no`,
      [sourceCode, newCode],
    );

    let approvers = 0;
    for (const g of groups) {
      const inserted = await q<{ id: string }>(
        `INSERT INTO portal.workflow_group_approvers
           (group_id, approver_type, approver_user_id, approver_level, approver_ref,
            approver_hint, escalation_type, escalation_ref, sort_order)
         SELECT $2, approver_type, approver_user_id, approver_level, approver_ref,
                approver_hint, escalation_type, escalation_ref, sort_order
         FROM portal.workflow_group_approvers WHERE group_id = $1
         RETURNING id`,
        [g.old_id, g.new_id],
      );
      approvers += inserted.length;
    }
    return { groups: groups.length, approvers };
  });

  await writeAudit({
    userId: user.id, role: user.accessLevel, action: "WORKFLOW_DEFINITION_DUPLICATE",
    resourceType: "workflows", resourceId: newCode,
    newValues: {
      sourceCode, code: newCode, name: newName.trim(),
      groupsCopied: copied.groups, approversCopied: copied.approvers, createdInactive: true,
    },
  });
  return { code: newCode, groupsCopied: copied.groups, approversCopied: copied.approvers };
}
