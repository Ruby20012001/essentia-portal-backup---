import { query } from "@/lib/db";

/**
 * Audit trail writer (audit.log — partitioned, insert-only; UPDATE/DELETE
 * are revoked at the database). Entries carry the acting user AND their
 * role at the time of the action. A failed audit write is reported but
 * never breaks the business operation it was recording.
 */

export type AuditEntry = {
  userId?: string | null;
  role?: "L0" | "L1" | "L2" | "L3" | null;
  action: string; // CREATE, UPDATE, APPROVE, PERMISSION_DENY, AI_CALL, ...
  resourceType: string;
  resourceId?: string | null;
  oldValues?: unknown;
  newValues?: unknown;
};

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit.log
         (user_id, actor_role, action, resource_type, resource_id, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        entry.userId ?? null,
        entry.role ?? null,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.oldValues === undefined ? null : JSON.stringify(entry.oldValues),
        entry.newValues === undefined ? null : JSON.stringify(entry.newValues),
      ],
    );
  } catch (error) {
    console.error("audit.log write failed:", error, entry.action, entry.resourceType);
  }
}
