import { query } from "@/lib/db";
import { requirePermission } from "@/lib/services/permissions";
import type { SessionUser } from "@/lib/auth/session";

/** Read side of the audit trail — permission-gated (L0/L1 per the matrix). */

export type AuditRecord = {
  id: string;
  userId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  oldValues: unknown;
  newValues: unknown;
  createdAt: string;
};

export async function listAuditEntries(
  user: SessionUser,
  filters: { resourceType?: string; resourceId?: string; limit?: number } = {},
): Promise<AuditRecord[]> {
  await requirePermission(user, "read", "audit_log");
  const rows = await query<{
    id: string;
    user_id: string | null;
    actor_role: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    old_values: unknown;
    new_values: unknown;
    created_at: string;
  }>(
    `SELECT id, user_id, actor_role, action, resource_type, resource_id,
            old_values, new_values, created_at::TEXT
     FROM audit.log
     WHERE ($1::TEXT IS NULL OR resource_type = $1)
       AND ($2::UUID IS NULL OR resource_id = $2)
     ORDER BY created_at DESC
     LIMIT $3`,
    [filters.resourceType ?? null, filters.resourceId ?? null, filters.limit ?? 50],
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    actorRole: r.actor_role,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    oldValues: r.old_values,
    newValues: r.new_values,
    createdAt: r.created_at,
  }));
}
