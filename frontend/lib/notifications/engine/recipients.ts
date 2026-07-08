import { query } from "@/lib/db";
import type { StoredEvent } from "@/lib/notifications/events/types";

/**
 * Recipient resolution strategies (data-driven via event_routes). The event
 * carries context; the strategy turns it into a set of recipient user ids.
 */
export type RecipientStrategy =
  | "explicit"
  | "actor"
  | "project_tl"
  | "workflow_step_approver"
  | "workflow_started_by";

export async function resolveRecipients(
  strategy: RecipientStrategy,
  event: StoredEvent,
): Promise<string[]> {
  const payload = event.payload ?? {};
  switch (strategy) {
    case "explicit": {
      const one = payload.recipientId as string | undefined;
      const many = payload.recipientIds as string[] | undefined;
      return [...(one ? [one] : []), ...(many ?? [])].filter(Boolean);
    }
    case "actor":
      return event.actorId ? [event.actorId] : [];
    case "project_tl": {
      const projectId = (payload.projectId as string) ?? event.entityId;
      if (!projectId) return [];
      const rows = await query<{ crmtl_id: string | null }>(
        `SELECT crmtl_id FROM ee.projects WHERE id = $1`,
        [projectId],
      );
      return rows[0]?.crmtl_id ? [rows[0].crmtl_id] : [];
    }
    case "workflow_step_approver": {
      const instanceId = payload.instanceId as string | undefined;
      if (!instanceId) return [];
      const rows = await query<{ approver_user_id: string | null }>(
        `SELECT ws.approver_user_id
         FROM portal.workflow_instances i
         JOIN portal.workflow_steps ws
           ON ws.workflow_code = i.workflow_code AND ws.step_no = i.current_step
         WHERE i.id = $1`,
        [instanceId],
      );
      return rows[0]?.approver_user_id ? [rows[0].approver_user_id] : [];
    }
    case "workflow_started_by": {
      const instanceId = payload.instanceId as string | undefined;
      if (!instanceId) return [];
      const rows = await query<{ started_by: string | null }>(
        `SELECT started_by FROM portal.workflow_instances WHERE id = $1`,
        [instanceId],
      );
      return rows[0]?.started_by ? [rows[0].started_by] : [];
    }
    default:
      return [];
  }
}
