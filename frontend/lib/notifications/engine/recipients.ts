import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
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
  | "workflow_started_by"
  | "platform_admins";

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
    case "platform_admins": {
      // Config-driven: alert the platform operators. Founders by access level,
      // plus anyone whose job title matches a configured pattern (COO, CTO /
      // Platform Administrator, and any future Operations role). Adding a role
      // is a config change — no code edit.
      const levels = await getConfig<string[]>("notifications.admin_alert_levels", ["L0"]);
      const patterns = await getConfig<string[]>("notifications.admin_alert_title_patterns", []);
      const likeParams = patterns.map((p) => `%${p}%`);
      const likeClauses = patterns.map((_, i) => `job_title ILIKE $${i + 2}`);
      const rows = await query<{ id: string }>(
        `SELECT id FROM public.users
         WHERE is_active
           AND (access_level::text = ANY($1)
                ${likeClauses.length ? `OR ${likeClauses.join(" OR ")}` : ""})`,
        [levels, ...likeParams],
      );
      return rows.map((r) => r.id);
    }
    default:
      return [];
  }
}
