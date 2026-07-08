import type { Channel } from "@/lib/notifications/events/types";

/** Rendered notification content handed to a channel provider. */
export type RenderedNotification = {
  title: string;
  body: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
  tier: "urgent" | "action_required" | "informational";
  category: string;
  notificationType: string;
};

export type DeliveryContext = {
  deliveryId: string;
  eventId: string;
  recipientId: string;
};

export type ChannelResult =
  | { status: "sent"; inAppId?: string }
  | { status: "failed"; error: string };

/**
 * A channel provider. send() attempts one delivery and reports the outcome;
 * a 'failed' result is retried by the delivery engine (backoff → dead-letter).
 * Providers never throw for expected failures — they return 'failed'.
 */
export interface NotificationChannel {
  readonly name: Channel;
  /** True when the channel can actually deliver (credentials present). */
  isConfigured(): Promise<boolean>;
  send(rendered: RenderedNotification, ctx: DeliveryContext): Promise<ChannelResult>;
}
