import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import type { SessionUser } from "@/lib/auth/session";

/**
 * RBAC permission engine — the security backbone (foundation ruling #3).
 * Rules live in public.permissions; this layer only RESOLVES them:
 *   - deny by default (no matching row = not allowed)
 *   - a department-specific row beats the level's global row
 *   - decisions are logged to the audit trail per rbac.audit_mode
 * Changing policy is a row update, never a code edit.
 *
 * Note: this engine governs actions. Row-level VISIBILITY is additionally
 * enforced by Postgres RLS through withUserContext — both layers apply.
 */

export type PermissionAction =
  | "read"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "reject"
  | "assign"
  | "escalate"
  | "export"
  | "ai_access"
  | "financial_access"
  | "hr_access";

export type PermissionScope = "all" | "own_dept" | "own_records";

export type PermissionDecision = {
  allowed: boolean;
  scope: PermissionScope;
  source: "department" | "global" | "default_deny";
};

const SENSITIVE_ACTIONS: ReadonlySet<PermissionAction> = new Set([
  "delete",
  "approve",
  "reject",
  "export",
  "ai_access",
  "financial_access",
  "hr_access",
]);

export class PermissionError extends Error {
  readonly status = 403;
  constructor(user: SessionUser, action: PermissionAction, resource: string) {
    super(
      `${user.accessLevel} is not permitted to ${action} on ${resource}. ` +
        `Permissions are configured in public.permissions — this is policy, not a bug.`,
    );
    this.name = "PermissionError";
  }
}

export async function can(
  user: SessionUser,
  action: PermissionAction,
  resource: string,
): Promise<PermissionDecision> {
  const rows = await query<{
    allowed: boolean;
    scope: PermissionScope;
    department_id: string | null;
  }>(
    `SELECT allowed, scope, department_id
     FROM public.permissions
     WHERE access_level = $1
       AND resource_type = $2
       AND action_code = $3
       AND (department_id = $4 OR department_id IS NULL)
     ORDER BY department_id NULLS LAST
     LIMIT 1`,
    [user.accessLevel, resource, action, user.departmentId],
  );

  const rule = rows[0];
  const decision: PermissionDecision = rule
    ? {
        allowed: rule.allowed,
        scope: rule.scope,
        source: rule.department_id ? "department" : "global",
      }
    : { allowed: false, scope: "own_records", source: "default_deny" };

  await logDecision(user, action, resource, decision);
  return decision;
}

/** Resolves the permission and throws PermissionError when not allowed. */
export async function requirePermission(
  user: SessionUser,
  action: PermissionAction,
  resource: string,
): Promise<PermissionDecision> {
  const decision = await can(user, action, resource);
  if (!decision.allowed) {
    throw new PermissionError(user, action, resource);
  }
  return decision;
}

async function logDecision(
  user: SessionUser,
  action: PermissionAction,
  resource: string,
  decision: PermissionDecision,
): Promise<void> {
  const mode = await getConfig<string>("rbac.audit_mode", "denials_and_sensitive");
  const shouldLog =
    mode === "all" ||
    (mode === "denials_and_sensitive" &&
      (!decision.allowed || SENSITIVE_ACTIONS.has(action))) ||
    (mode === "sensitive_only" && SENSITIVE_ACTIONS.has(action));
  if (!shouldLog) return;

  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: decision.allowed ? "PERMISSION_ALLOW" : "PERMISSION_DENY",
    resourceType: resource,
    newValues: {
      permissionAction: action,
      accessLevel: user.accessLevel,
      departmentId: user.departmentId,
      scope: decision.scope,
      source: decision.source,
    },
  });
}
