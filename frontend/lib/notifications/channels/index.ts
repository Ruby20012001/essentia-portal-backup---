import { inAppChannel } from "@/lib/notifications/channels/in-app";
import { teamsChannel } from "@/lib/notifications/channels/teams";
import { emailChannel } from "@/lib/notifications/channels/email";
import { whatsappChannel, smsChannel, pushChannel } from "@/lib/notifications/channels/stubs";
import type { Channel } from "@/lib/notifications/events/types";
import type { NotificationChannel } from "@/lib/notifications/channels/types";

/** Channel registry — providers are interchangeable and looked up by name. */
export const CHANNEL_REGISTRY: Record<Channel, NotificationChannel> = {
  in_app: inAppChannel,
  teams: teamsChannel,
  email: emailChannel,
  whatsapp: whatsappChannel,
  sms: smsChannel,
  push: pushChannel,
};

export function getChannel(name: Channel): NotificationChannel {
  return CHANNEL_REGISTRY[name];
}
