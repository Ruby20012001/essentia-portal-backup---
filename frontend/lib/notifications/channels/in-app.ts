import { query } from "@/lib/db";
import type {
  ChannelResult,
  DeliveryContext,
  NotificationChannel,
  RenderedNotification,
} from "@/lib/notifications/channels/types";

/**
 * In-app channel — the live inbox (portal.notifications). Always configured;
 * this is what the Notification Center renders. The delivery row links to the
 * inbox row it created.
 */
export const inAppChannel: NotificationChannel = {
  name: "in_app",

  async isConfigured() {
    return true;
  },

  async send(
    rendered: RenderedNotification,
    ctx: DeliveryContext,
  ): Promise<ChannelResult> {
    const [row] = await query<{ id: string }>(
      `INSERT INTO portal.notifications
         (recipient_id, tier, title, body, action_url, action_label,
          delivered_app, source_type, source_id, event_id, notification_type, category)
       VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8,$9,$10,$11)
       RETURNING id`,
      [
        ctx.recipientId,
        rendered.tier,
        rendered.title,
        rendered.body,
        rendered.actionUrl,
        rendered.actionLabel,
        rendered.notificationType,
        ctx.eventId,
        ctx.eventId,
        rendered.notificationType,
        rendered.category,
      ],
    );
    return { status: "sent", inAppId: row.id };
  },
};
