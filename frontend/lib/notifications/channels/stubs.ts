import type { Channel } from "@/lib/notifications/events/types";
import type {
  ChannelResult,
  NotificationChannel,
} from "@/lib/notifications/channels/types";

/**
 * Prepared-interface channels (WhatsApp / SMS / Push). Registered so routes
 * can target them, but not yet implemented — they report 'failed' with a
 * clear reason (delivery retries then dead-letters). Implement each when its
 * gateway (Twilio for WhatsApp/SMS, FCM/APNs for Push) is provisioned (A-22).
 */
function preparedChannel(name: Channel, gateway: string): NotificationChannel {
  return {
    name,
    async isConfigured() {
      return false;
    },
    async send(): Promise<ChannelResult> {
      return { status: "failed", error: `${name} channel not implemented — awaiting ${gateway} (A-22)` };
    },
  };
}

export const whatsappChannel = preparedChannel("whatsapp", "Twilio WhatsApp");
export const smsChannel = preparedChannel("sms", "Twilio SMS");
export const pushChannel = preparedChannel("push", "FCM/APNs");
