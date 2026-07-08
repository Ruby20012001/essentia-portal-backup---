import { query } from "@/lib/db";
import { renderTemplate } from "@/lib/services/notifications";
import type { RenderedNotification } from "@/lib/notifications/channels/types";

/**
 * Renders a notification from a template row + event vars. One rendered
 * object is produced per event and reused across channels (each channel
 * formats it for its medium).
 */
export async function renderNotification(
  templateCode: string,
  vars: Record<string, string | number>,
  meta: { tier: RenderedNotification["tier"]; category: string; notificationType: string },
): Promise<RenderedNotification> {
  const [tpl] = await query<{
    title_template: string;
    body_template: string | null;
    action_url_template: string | null;
    action_label: string | null;
  }>(
    `SELECT title_template, body_template, action_url_template, action_label
     FROM portal.notification_templates WHERE code = $1 AND is_active`,
    [templateCode],
  );
  if (!tpl) {
    throw new Error(`Unknown notification template '${templateCode}'`);
  }
  return {
    title: renderTemplate(tpl.title_template, vars),
    body: tpl.body_template ? renderTemplate(tpl.body_template, vars) : null,
    actionUrl: tpl.action_url_template ? renderTemplate(tpl.action_url_template, vars) : null,
    actionLabel: tpl.action_label,
    tier: meta.tier,
    category: meta.category,
    notificationType: meta.notificationType,
  };
}
