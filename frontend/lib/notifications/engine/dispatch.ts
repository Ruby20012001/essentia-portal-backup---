import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { getChannel } from "@/lib/notifications/channels";
import { renderNotification } from "@/lib/notifications/engine/render";
import { resolveRecipients, type RecipientStrategy } from "@/lib/notifications/engine/recipients";
import {
  channelAllowed,
  getPreferences,
  quietHoursDeferUntil,
} from "@/lib/notifications/engine/preferences";
import type { RenderedNotification } from "@/lib/notifications/channels/types";
import type { Channel, EventCategory, EventPriority, StoredEvent } from "@/lib/notifications/events/types";

type Route = {
  category: EventCategory;
  notification_type: string;
  template_code: string | null;
  recipient_strategy: RecipientStrategy;
  default_channels: Channel[];
  priority: EventPriority;
};

/** Coerce a JSON payload into string/number template vars. */
function toVars(payload: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (typeof v === "number") out[k] = v;
    else if (v != null && typeof v !== "object") out[k] = String(v);
  }
  return out;
}

/**
 * Fan an event out to per-recipient, per-channel deliveries and attempt each.
 * Duplicate deliveries are prevented by a unique (event, recipient, channel).
 * A channel disabled at system level or by preference is skipped; quiet hours
 * defer interruptive channels; failures schedule a retry.
 */
export async function dispatchEvent(event: StoredEvent): Promise<void> {
  const [route] = await query<Route>(
    `SELECT category, notification_type, template_code, recipient_strategy,
            default_channels, priority
     FROM portal.event_routes WHERE event_type = $1 AND is_active`,
    [event.type],
  );
  if (!route || !route.template_code) return;

  const recipients = await resolveRecipients(route.recipient_strategy, event);
  if (recipients.length === 0) return;

  const priority = event.priority ?? route.priority;
  const rendered = await renderNotification(route.template_code, toVars(event.payload ?? {}), {
    tier: priority,
    category: route.category,
    notificationType: route.notification_type,
  });

  const liveChannels = await getConfig<string[]>("notifications.channels_live", ["in_app"]);
  const maxAttempts = await getConfig<number>("notifications.retry_max_attempts", 5);
  const now = new Date();

  for (const recipientId of recipients) {
    const prefs = await getPreferences(recipientId);
    for (const channel of route.default_channels) {
      if (!liveChannels.includes(channel)) continue; // off at system level
      if (!channelAllowed(prefs, channel, route.category)) continue; // off by preference

      const deferUntil = quietHoursDeferUntil(prefs, channel, priority, now);
      const [delivery] = await query<{ id: string }>(
        `INSERT INTO portal.notification_deliveries
           (event_id, recipient_id, channel, notification_type, max_attempts,
            next_attempt_at, rendered)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
         ON CONFLICT (event_id, recipient_id, channel) DO NOTHING
         RETURNING id`,
        [
          event.id,
          recipientId,
          channel,
          route.notification_type,
          maxAttempts,
          deferUntil ?? now,
          JSON.stringify(rendered),
        ],
      );
      if (!delivery) continue; // duplicate — already dispatched
      if (deferUntil) continue; // quiet hours — leave pending for the retry job
      await attemptDelivery(delivery.id, channel, recipientId, event.id, rendered);
    }
  }
}

/** Attempts one delivery; records outcome, backoff, or dead-letter. */
async function attemptDelivery(
  deliveryId: string,
  channelName: Channel,
  recipientId: string,
  eventId: string,
  rendered: RenderedNotification,
): Promise<void> {
  const channel = getChannel(channelName);
  const result = await channel.send(rendered, { deliveryId, eventId, recipientId });

  if (result.status === "sent") {
    await query(
      `UPDATE portal.notification_deliveries
       SET status='sent', attempts=attempts+1, sent_at=NOW(), updated_at=NOW(),
           in_app_id=$2, last_error=NULL
       WHERE id=$1`,
      [deliveryId, "inAppId" in result ? (result.inAppId ?? null) : null],
    );
  } else {
    const base = await getConfig<number>("notifications.retry_base_seconds", 30);
    const cap = await getConfig<number>("notifications.retry_cap_seconds", 3600);
    // Compute next state from the current attempt count atomically.
    const [row] = await query<{ status: string; attempts: number }>(
      `UPDATE portal.notification_deliveries
       SET attempts = attempts + 1,
           last_error = $2,
           status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead' ELSE 'pending' END,
           next_attempt_at = NOW() + (LEAST($3::INT * POWER(2, attempts), $4::INT) || ' seconds')::INTERVAL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING status, attempts`,
      [deliveryId, result.error, base, cap],
    );
    if (row?.status === "dead") {
      await writeAudit({
        userId: recipientId,
        action: "NOTIFICATION_DEAD_LETTER",
        resourceType: "notifications",
        resourceId: deliveryId,
        newValues: { channel: channelName, eventId, attempts: row.attempts, error: result.error },
      });
    }
  }

  await writeAudit({
    userId: recipientId,
    action: "NOTIFICATION_DELIVERY",
    resourceType: "notifications",
    resourceId: deliveryId,
    newValues: {
      channel: channelName,
      eventId,
      type: rendered.notificationType,
      status: result.status,
      error: result.status === "failed" ? result.error : undefined,
    },
  });
}

/**
 * Retry job — processes due pending deliveries (backoff elapsed). The
 * auto-pilot scheduler will call this on a cadence (A-14); until then it is
 * driven by POST /api/jobs/notifications/dispatch.
 */
export async function processDueDeliveries(limit = 100): Promise<{ processed: number; sent: number; dead: number }> {
  const due = await query<{
    id: string;
    channel: Channel;
    recipient_id: string;
    event_id: string;
    rendered: RenderedNotification;
  }>(
    `SELECT id, channel, recipient_id, event_id, rendered
     FROM portal.notification_deliveries
     WHERE status = 'pending' AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at ASC
     LIMIT $1`,
    [limit],
  );

  let sent = 0;
  let dead = 0;
  for (const d of due) {
    await attemptDelivery(d.id, d.channel, d.recipient_id, d.event_id, d.rendered);
    const [after] = await query<{ status: string }>(
      `SELECT status FROM portal.notification_deliveries WHERE id = $1`,
      [d.id],
    );
    if (after?.status === "sent") sent += 1;
    else if (after?.status === "dead") dead += 1;
  }
  return { processed: due.length, sent, dead };
}
