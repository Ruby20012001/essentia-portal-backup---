import { query, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { BlockingRuleError, ConflictError, NotFoundError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";
import {
  APPROVER_TYPES,
  REJECT_POLICIES,
  TIMEOUT_ACTIONS,
  ACCESS_LEVELS,
  validateDefinitionStructure,
  hasBlockingErrors,
  type BuilderApprover,
  type BuilderGroup,
} from "@/lib/services/workflow-builder-shared";

/**
 * Workflow Builder — the WRITE surface for editing a definition's structure
 * (frontend screen 5). Read/list/archive/restore/duplicate live in
 * workflow-definitions.ts; this adds the single-definition detail read and the
 * create / rename / structure-save / activate operations.
 *
 * SAFETY (why this never touches the engine, scheduler or running work):
 *   • A definition is EDITABLE only when is_active = FALSE AND it has no running
 *     instances. Active definitions and archived-but-still-running ones are
 *     refused — you duplicate to a fresh copy and edit that (Duplicate → Edit →
 *     Activate → Archive Old). Running instances re-read groups by
 *     (definition_code, group_no), so editing a live definition's groups would
 *     rewrite work mid-flight; the editable gate forbids exactly that.
 *   • Structure save is one transaction that replaces the groups+approvers of an
 *     editable definition. It writes only to workflow_groups /
 *     workflow_group_approvers — no engine, scheduler or notification code runs.
 *   • Activation only flips is_active = TRUE, and only when validation passes.
 * Every mutation is permission-gated and audited.
 */

const CODE_PATTERN = /^[a-z0-9_]{3,50}$/;

export type DetailApprover = BuilderApprover & { id: string };
export type DetailGroup = Omit<BuilderGroup, "approvers"> & { id: string; groupNo: number; approvers: DetailApprover[] };

export type WorkflowDefinitionDetail = {
  code: string;
  name: string;
  resourceType: string | null;
  description: string | null;
  isActive: boolean;
  runningCount: number;
  editable: boolean; // inactive AND no running instances
  createdAt: string;
  updatedAt: string | null;
  groups: DetailGroup[];
};

/** Full structure of ONE definition, for the builder. Read-only. */
export async function getWorkflowDefinitionDetail(
  user: SessionUser,
  code: string,
): Promise<WorkflowDefinitionDetail | null> {
  await requirePermission(user, "read", "workflows");

  const [def] = await query<{
    code: string;
    name: string;
    resource_type: string | null;
    description: string | null;
    is_active: boolean;
    created_at: string;
    updated_at: string | null;
    running_count: number;
  }>(
    `SELECT d.code, d.name, d.resource_type, d.description, d.is_active,
            d.created_at::text AS created_at, d.updated_at::text AS updated_at,
            COALESCE(r.n, 0)::int AS running_count
     FROM portal.workflow_definitions d
     LEFT JOIN (
       SELECT workflow_code, COUNT(*) AS n FROM portal.workflow_instances
       WHERE status = 'pending' GROUP BY workflow_code
     ) r ON r.workflow_code = d.code
     WHERE d.code = $1`,
    [code],
  );
  if (!def) return null;

  const groupRows = await query<{
    id: string;
    group_no: number;
    name: string;
    quorum: number;
    reject_policy: BuilderGroup["rejectPolicy"];
    condition: unknown | null;
    sla_hours: number | null;
    warn_hours: number | null;
    timeout_hours: number | null;
    timeout_action: BuilderGroup["timeoutAction"];
    reminder_hours: number | null;
  }>(
    `SELECT id, group_no, name, quorum, reject_policy, condition,
            sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours
     FROM portal.workflow_groups WHERE definition_code = $1 ORDER BY group_no`,
    [code],
  );

  const approverRows = groupRows.length
    ? await query<{
        id: string;
        group_id: string;
        approver_type: BuilderApprover["approverType"];
        approver_user_id: string | null;
        approver_level: BuilderApprover["approverLevel"];
        approver_ref: string | null;
        approver_hint: string | null;
        escalation_type: BuilderApprover["escalationType"];
        escalation_ref: string | null;
        sort_order: number;
        approver_name: string | null;
      }>(
        `SELECT a.id, a.group_id, a.approver_type, a.approver_user_id, a.approver_level,
                a.approver_ref, a.approver_hint, a.escalation_type, a.escalation_ref,
                a.sort_order, u.full_name AS approver_name
         FROM portal.workflow_group_approvers a
         LEFT JOIN public.users u ON u.id = a.approver_user_id
         WHERE a.group_id = ANY($1)
         ORDER BY a.group_id, a.sort_order`,
        [groupRows.map((g) => g.id)],
      )
    : [];

  const groups: DetailGroup[] = groupRows.map((g) => ({
    id: g.id,
    groupNo: g.group_no,
    name: g.name,
    quorum: g.quorum,
    rejectPolicy: g.reject_policy,
    condition: g.condition ?? null,
    slaHours: g.sla_hours,
    warnHours: g.warn_hours,
    timeoutHours: g.timeout_hours,
    timeoutAction: g.timeout_action,
    reminderHours: g.reminder_hours,
    approvers: approverRows
      .filter((a) => a.group_id === g.id)
      .map((a) => ({
        id: a.id,
        approverType: a.approver_type,
        approverUserId: a.approver_user_id,
        approverLevel: a.approver_level,
        approverRef: a.approver_ref,
        approverHint: a.approver_hint,
        escalationType: a.escalation_type,
        escalationRef: a.escalation_ref,
        approverName: a.approver_name,
      })),
  }));

  return {
    code: def.code,
    name: def.name,
    resourceType: def.resource_type,
    description: def.description,
    isActive: def.is_active,
    runningCount: def.running_count,
    editable: !def.is_active && def.running_count === 0,
    createdAt: def.created_at,
    updatedAt: def.updated_at,
    groups,
  };
}

export type BuilderOptions = {
  users: Array<{ id: string; fullName: string }>;
  resourceTypes: Array<{ code: string; name: string }>;
  accessLevels: string[];
};

/** Dropdown data for the editor (active users, resource types, access levels). */
export async function getBuilderOptions(user: SessionUser): Promise<BuilderOptions> {
  await requirePermission(user, "read", "workflows");
  const [users, resourceTypes] = await Promise.all([
    query<{ id: string; fullName: string }>(
      `SELECT id, full_name AS "fullName" FROM public.users WHERE is_active ORDER BY full_name`,
    ),
    query<{ code: string; name: string }>(`SELECT code, name FROM public.resource_types ORDER BY name`),
  ]);
  return { users, resourceTypes, accessLevels: [...ACCESS_LEVELS] };
}

/** Create a new definition — a DRAFT (inactive, no groups). */
export async function createDefinition(
  user: SessionUser,
  input: { code: string; name: string; resourceType?: string | null; description?: string | null },
): Promise<{ code: string }> {
  await requirePermission(user, "create", "workflows");

  const code = input.code?.trim();
  if (!CODE_PATTERN.test(code ?? "")) {
    throw new BlockingRuleError(
      "A workflow code must be 3–50 characters: lower-case letters, numbers or underscores.",
    );
  }
  if (code === "new") {
    throw new BlockingRuleError("'new' is a reserved code — choose another.");
  }
  if (!input.name?.trim()) throw new BlockingRuleError("A workflow name is required.");

  const [clash] = await query<{ code: string }>(
    `SELECT code FROM portal.workflow_definitions WHERE code = $1`,
    [code],
  );
  if (clash) throw new ConflictError(`A workflow with the code '${code}' already exists.`);

  await query(
    `INSERT INTO portal.workflow_definitions (code, name, resource_type, description, is_active, updated_at)
     VALUES ($1, $2, $3, $4, FALSE, NOW())`,
    [code, input.name.trim(), input.resourceType ?? null, input.description?.trim() || null],
  );
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_DEFINITION_CREATE",
    resourceType: "workflows",
    resourceId: code,
    newValues: { code, name: input.name.trim(), resourceType: input.resourceType ?? null, createdInactive: true },
  });
  return { code };
}

/** Load an editable definition or explain why it isn't. */
async function loadEditable(code: string): Promise<{ isActive: boolean; running: number }> {
  const [def] = await query<{ is_active: boolean; running: number }>(
    `SELECT d.is_active,
            (SELECT COUNT(*) FROM portal.workflow_instances
             WHERE workflow_code = d.code AND status = 'pending')::int AS running
     FROM portal.workflow_definitions d WHERE d.code = $1`,
    [code],
  );
  if (!def) throw new NotFoundError("Workflow definition not found.");
  if (def.is_active) {
    throw new BlockingRuleError("This workflow is active and can't be edited. Duplicate it to make changes.");
  }
  if (def.running > 0) {
    throw new BlockingRuleError(
      `This workflow still has ${def.running} running instance${def.running === 1 ? "" : "s"} and can't be edited. Duplicate it to make changes.`,
    );
  }
  return { isActive: def.is_active, running: def.running };
}

/** Rename / change module / description of an editable (draft) definition. */
export async function updateDefinitionMeta(
  user: SessionUser,
  code: string,
  input: { name?: string; resourceType?: string | null; description?: string | null },
): Promise<{ code: string }> {
  await requirePermission(user, "edit", "workflows");
  await loadEditable(code);

  if (input.name !== undefined && !input.name.trim()) {
    throw new BlockingRuleError("A workflow name cannot be empty.");
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.name !== undefined) {
    params.push(input.name.trim());
    sets.push(`name = $${params.length}`);
  }
  if (input.resourceType !== undefined) {
    params.push(input.resourceType);
    sets.push(`resource_type = $${params.length}`);
  }
  if (input.description !== undefined) {
    params.push(input.description?.trim() || null);
    sets.push(`description = $${params.length}`);
  }
  if (sets.length === 0) return { code };

  params.push(code);
  await query(
    `UPDATE portal.workflow_definitions SET ${sets.join(", ")}, updated_at = NOW() WHERE code = $${params.length}`,
    params,
  );
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_DEFINITION_UPDATE",
    resourceType: "workflows",
    resourceId: code,
    newValues: { code, ...input },
  });
  return { code };
}

/** Reject a save that would violate a DB CHECK, with a friendly message. */
function assertSavable(groups: BuilderGroup[]): void {
  groups.forEach((g, i) => {
    const gi = i + 1;
    if (!g.name || !g.name.trim()) throw new BlockingRuleError(`Group ${gi} needs a name before saving.`);
    if (!Number.isInteger(g.quorum) || g.quorum < 1) {
      throw new BlockingRuleError(`Group ${gi}: quorum must be a whole number of at least 1.`);
    }
    if (!REJECT_POLICIES.includes(g.rejectPolicy)) throw new BlockingRuleError(`Group ${gi}: invalid reject policy.`);
    if (g.timeoutAction != null && !TIMEOUT_ACTIONS.includes(g.timeoutAction)) {
      throw new BlockingRuleError(`Group ${gi}: invalid timeout action.`);
    }
    for (const [label, v] of [
      ["SLA", g.slaHours],
      ["Warning", g.warnHours],
      ["Timeout", g.timeoutHours],
      ["Reminder", g.reminderHours],
    ] as const) {
      if (v != null && (!Number.isInteger(v) || v <= 0)) {
        throw new BlockingRuleError(`Group ${gi}: ${label} hours must be a positive whole number.`);
      }
    }
    if (g.condition != null && (typeof g.condition !== "object" || Array.isArray(g.condition))) {
      throw new BlockingRuleError(`Group ${gi}: condition must be a JSON object or empty.`);
    }
    (g.approvers ?? []).forEach((a, ai) => {
      if (!APPROVER_TYPES.includes(a.approverType)) {
        throw new BlockingRuleError(`Group ${gi}, approver ${ai + 1}: invalid approver type.`);
      }
      if (a.escalationType != null && !APPROVER_TYPES.includes(a.escalationType)) {
        throw new BlockingRuleError(`Group ${gi}, approver ${ai + 1}: invalid escalation type.`);
      }
    });
  });
}

/**
 * Replace the entire group/approver structure of an editable definition, in one
 * transaction. Group order in the array becomes group_no (1..N); approver order
 * becomes sort_order. Only the target populated by approver_type is written.
 */
export async function saveDefinitionStructure(
  user: SessionUser,
  code: string,
  groups: BuilderGroup[],
): Promise<{ groups: number; approvers: number }> {
  await requirePermission(user, "edit", "workflows");
  await loadEditable(code);
  assertSavable(groups);

  let approverCount = 0;
  await withTransaction(async (q) => {
    // Cascade removes the old approvers; we rebuild from the payload.
    await q(`DELETE FROM portal.workflow_groups WHERE definition_code = $1`, [code]);

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]!;
      const [grp] = await q<{ id: string }>(
        `INSERT INTO portal.workflow_groups
           (definition_code, group_no, name, quorum, reject_policy, condition,
            sla_hours, warn_hours, timeout_hours, timeout_action, reminder_hours)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          code,
          i + 1,
          g.name.trim(),
          g.quorum,
          g.rejectPolicy,
          g.condition == null ? null : JSON.stringify(g.condition),
          g.slaHours,
          g.warnHours,
          g.timeoutHours,
          g.timeoutAction,
          g.reminderHours,
        ],
      );
      const groupId = grp!.id;

      const approvers = g.approvers ?? [];
      for (let j = 0; j < approvers.length; j++) {
        const a = approvers[j]!;
        await q(
          `INSERT INTO portal.workflow_group_approvers
             (group_id, approver_type, approver_user_id, approver_level, approver_ref,
              approver_hint, escalation_type, escalation_ref, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            groupId,
            a.approverType,
            a.approverType === "user" ? a.approverUserId : null,
            a.approverType === "access_level" ? a.approverLevel : null,
            a.approverType === "role" || a.approverType === "dynamic" ? a.approverRef : null,
            a.approverHint?.trim() || null,
            a.escalationType ?? null,
            a.escalationType ? a.escalationRef : null,
            j + 1,
          ],
        );
        approverCount += 1;
      }
    }
  });

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_DEFINITION_STRUCTURE_SAVE",
    resourceType: "workflows",
    resourceId: code,
    newValues: { code, groups: groups.length, approvers: approverCount },
  });
  return { groups: groups.length, approvers: approverCount };
}

/** Activate a draft definition — only when it validates cleanly. */
export async function activateDefinition(user: SessionUser, code: string): Promise<{ code: string }> {
  await requirePermission(user, "edit", "workflows");

  const detail = await getWorkflowDefinitionDetail(user, code);
  if (!detail) throw new NotFoundError("Workflow definition not found.");
  if (detail.isActive) throw new ConflictError("This workflow is already active.");

  const issues = validateDefinitionStructure(detail.groups);
  if (hasBlockingErrors(issues)) {
    const first = issues.find((i) => i.level === "error");
    throw new BlockingRuleError(
      `This workflow isn't ready to activate: ${first?.message ?? "fix the validation errors first."}`,
    );
  }

  await query(
    `UPDATE portal.workflow_definitions SET is_active = TRUE, updated_at = NOW() WHERE code = $1`,
    [code],
  );
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "WORKFLOW_DEFINITION_ACTIVATE",
    resourceType: "workflows",
    resourceId: code,
    oldValues: { isActive: false },
    newValues: { code, isActive: true, groups: detail.groups.length },
  });
  return { code };
}
