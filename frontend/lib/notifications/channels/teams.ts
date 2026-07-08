import { getConfig } from "@/lib/services/config";
import type {
  ChannelResult,
  DeliveryContext,
  NotificationChannel,
  RenderedNotification,
} from "@/lib/notifications/channels/types";

/**
 * Microsoft Teams channel — posts an Adaptive Card to an incoming webhook.
 * Code-complete: the card (title, body, action button/deep link) is built
 * and testable. Live delivery is credential-gated on config teams.webhook_url;
 * without it, send() returns 'failed' so the delivery retries then
 * dead-letters — it never pretends to deliver.
 */

const APP_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

/** Builds the Adaptive Card payload (exported for tests). */
export function buildAdaptiveCard(rendered: RenderedNotification) {
  const accent =
    rendered.tier === "urgent" ? "attention" : rendered.tier === "action_required" ? "warning" : "good";
  const body: unknown[] = [
    { type: "TextBlock", text: rendered.title, weight: "Bolder", size: "Medium", color: accent, wrap: true },
  ];
  if (rendered.body) body.push({ type: "TextBlock", text: rendered.body, wrap: true, spacing: "Small" });

  const actions = rendered.actionUrl
    ? [
        {
          type: "Action.OpenUrl",
          title: rendered.actionLabel ?? "Open",
          url: rendered.actionUrl.startsWith("http") ? rendered.actionUrl : `${APP_URL}${rendered.actionUrl}`,
        },
      ]
    : [];

  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: { type: "AdaptiveCard", version: "1.4", body, actions },
      },
    ],
  };
}

export const teamsChannel: NotificationChannel = {
  name: "teams",

  async isConfigured() {
    return Boolean(await getConfig<string>("teams.webhook_url", ""));
  },

  async send(rendered: RenderedNotification, _ctx: DeliveryContext): Promise<ChannelResult> {
    const webhook = await getConfig<string>("teams.webhook_url", "");
    if (!webhook) {
      return { status: "failed", error: "Teams webhook not configured (config teams.webhook_url)" };
    }
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAdaptiveCard(rendered)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { status: "failed", error: `Teams webhook HTTP ${res.status}` };
      return { status: "sent" };
    } catch (error) {
      return { status: "failed", error: error instanceof Error ? error.message : "Teams send failed" };
    }
  },
};
