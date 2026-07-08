import { describe, expect, it } from "vitest";
import { channelAllowed, quietHoursDeferUntil, type Preferences } from "@/lib/notifications/engine/preferences";
import { buildAdaptiveCard } from "@/lib/notifications/channels/teams";
import { buildEmailHtml } from "@/lib/notifications/channels/email";
import type { RenderedNotification } from "@/lib/notifications/channels/types";

const prefs = (over: Partial<Preferences> = {}): Preferences => ({
  userId: "u",
  channels: { in_app: true, email: true, teams: false },
  categoryPrefs: {},
  quietHoursStart: null,
  quietHoursEnd: null,
  digestFrequency: "none",
  ...over,
});

const rendered: RenderedNotification = {
  title: "Approval needed — pio ED/26-27/001",
  body: "PIO Approval step 1 awaits your decision.",
  actionUrl: "/wio-pio",
  actionLabel: "Review",
  tier: "action_required",
  category: "approval",
  notificationType: "approval_request",
};

describe("channelAllowed", () => {
  it("always allows in-app", () => {
    expect(channelAllowed(prefs({ channels: {} }), "in_app", "project")).toBe(true);
  });
  it("respects channel opt-in for interruptive channels", () => {
    expect(channelAllowed(prefs(), "email", "project")).toBe(true);
    expect(channelAllowed(prefs(), "teams", "project")).toBe(false);
  });
  it("mutes a category (except system)", () => {
    expect(channelAllowed(prefs({ categoryPrefs: { project: false } }), "in_app", "project")).toBe(false);
    expect(channelAllowed(prefs({ categoryPrefs: { system: false } }), "in_app", "system")).toBe(true);
  });
});

describe("quietHoursDeferUntil", () => {
  const p = prefs({ quietHoursStart: "22:00", quietHoursEnd: "07:00" });
  it("defers an interruptive channel during quiet hours", () => {
    const at = new Date("2026-07-07T23:30:00");
    const until = quietHoursDeferUntil(p, "email", "action_required", at);
    expect(until).not.toBeNull();
    expect(until!.getHours()).toBe(7);
  });
  it("never defers in-app", () => {
    expect(quietHoursDeferUntil(p, "in_app", "action_required", new Date("2026-07-07T23:30:00"))).toBeNull();
  });
  it("urgent bypasses quiet hours", () => {
    expect(quietHoursDeferUntil(p, "email", "urgent", new Date("2026-07-07T23:30:00"))).toBeNull();
  });
  it("does not defer outside quiet hours", () => {
    expect(quietHoursDeferUntil(p, "email", "action_required", new Date("2026-07-07T12:00:00"))).toBeNull();
  });
});

describe("buildAdaptiveCard", () => {
  it("builds a Teams adaptive card with title, body and an action", () => {
    const card = buildAdaptiveCard(rendered) as {
      attachments: { content: { body: { text: string }[]; actions: { title: string; url: string }[] } }[];
    };
    const content = card.attachments[0].content;
    expect(content.body[0].text).toBe(rendered.title);
    expect(content.actions[0].title).toBe("Review");
    expect(content.actions[0].url).toContain("/wio-pio");
  });
});

describe("buildEmailHtml", () => {
  it("renders branded HTML with title, body and CTA", () => {
    const html = buildEmailHtml(rendered);
    expect(html).toContain(rendered.title);
    expect(html).toContain("PIO Approval step 1");
    expect(html).toContain("Review");
    expect(html).toContain("#1C1714"); // espresso brand colour
    expect(html).toContain("every client returns");
  });
});
