import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * Approval inbox — the current user's actionable pending approvals across every
 * workflow, resolved to the EFFECTIVE approver (so delegates see delegated
 * tasks; the original who delegated does not). Only tasks in each instance's
 * current group are actionable and returned.
 */

export type ApprovalInboxItem = {
  taskId: string;
  instanceId: string;
  workflowName: string;
  resourceType: string;
  resourceId: string;
  resourceRef: string;
  groupName: string;
  assignedAt: string;
  slaDueAt: string | null;
  delegated: boolean; // delegated TO me (I'm not the original assignee)
};

export async function listMyApprovals(user: SessionUser): Promise<ApprovalInboxItem[]> {
  const rows = await query<{
    task_id: string;
    instance_id: string;
    workflow_name: string;
    resource_type: string;
    resource_id: string;
    group_name: string;
    assigned_at: string;
    sla_due_at: string | null;
    delegated: boolean;
  }>(
    `SELECT t.id AS task_id, t.instance_id, d.name AS workflow_name,
            i.resource_type, i.resource_id, g.name AS group_name,
            t.assigned_at::text AS assigned_at, t.sla_due_at::text AS sla_due_at,
            (t.delegated_to_user_id = $1 AND t.assignee_user_id <> $1) AS delegated
     FROM portal.workflow_tasks t
     JOIN portal.workflow_instances i ON i.id = t.instance_id AND i.status = 'pending'
     JOIN portal.workflow_definitions d ON d.code = i.workflow_code
     JOIN portal.workflow_groups g ON g.definition_code = i.workflow_code AND g.group_no = t.group_no
     WHERE t.status = 'pending' AND t.group_no = i.current_step
       AND COALESCE(t.delegated_to_user_id, t.assignee_user_id) = $1
     ORDER BY t.sla_due_at NULLS LAST, t.assigned_at`,
    [user.id],
  );
  return rows.map((r) => ({
    taskId: r.task_id,
    instanceId: r.instance_id,
    workflowName: r.workflow_name,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    resourceRef: `${r.resource_type} ${r.resource_id}`,
    groupName: r.group_name,
    assignedAt: r.assigned_at,
    slaDueAt: r.sla_due_at,
    delegated: r.delegated,
  }));
}
