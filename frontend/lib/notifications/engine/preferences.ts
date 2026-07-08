import { query } from "@/lib/db";
import type { Channel, EventCategory, EventPriority } from "@/lib/notifications/events/types";

/**
 * Per-user delivery preferences. The engine consults these to decide which
 * channels a recipient gets and whether quiet hours defer an interruptive
 * channel. Urgent events bypass quiet hours and category mutes.
 */
export type Preferences = {
  userId: string;
  channels: Record<string, boolean>;
  categoryPrefs: Record<string, boolean>;
  quietHoursStart: string | null; // 'HH:MM'
  quietHoursEnd: string | null;
  digestFrequency: "none" | "daily" | "weekly";
};

const DEFAULTS: Omit<Preferences, "userId"> = {
  channels: { in_app: true, email: false, teams: false },
  categoryPrefs: {},
  quietHoursStart: null,
  quietHoursEnd: null,
  digestFrequency: "none",
};

export async function getPreferences(userId: string): Promise<Preferences> {
  const rows = await query<{
    channels: Record<string, boolean>;
    category_prefs: Record<string, boolean>;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    digest_frequency: Preferences["digestFrequency"];
  }>(
    `SELECT channels, category_prefs, quiet_hours_start::TEXT,
            quiet_hours_end::TEXT, digest_frequency
     FROM portal.notification_preferences WHERE user_id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r) return { userId, ...DEFAULTS };
  return {
    userId,
    channels: r.channels ?? DEFAULTS.channels,
    categoryPrefs: r.category_prefs ?? {},
    quietHoursStart: r.quiet_hours_start,
    quietHoursEnd: r.quiet_hours_end,
    digestFrequency: r.digest_frequency,
  };
}

export async function upsertPreferences(
  userId: string,
  patch: Partial<Omit<Preferences, "userId">>,
): Promise<Preferences> {
  const current = await getPreferences(userId);
  const next = { ...current, ...patch };
  await query(
    `INSERT INTO portal.notification_preferences
       (user_id, channels, category_prefs, quiet_hours_start, quiet_hours_end, digest_frequency, updated_at)
     VALUES ($1,$2::jsonb,$3::jsonb,$4,$5,$6,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       channels = EXCLUDED.channels, category_prefs = EXCLUDED.category_prefs,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       digest_frequency = EXCLUDED.digest_frequency, updated_at = NOW()`,
    [
      userId,
      JSON.stringify(next.channels),
      JSON.stringify(next.categoryPrefs),
      next.quietHoursStart,
      next.quietHoursEnd,
      next.digestFrequency,
    ],
  );
  return next;
}

/** In-app is always allowed (non-interruptive inbox). Others obey prefs. */
export function channelAllowed(
  prefs: Preferences,
  channel: Channel,
  category: EventCategory,
): boolean {
  if (prefs.categoryPrefs[category] === false && category !== "system") return false;
  if (channel === "in_app") return true;
  return prefs.channels[channel] === true;
}

/**
 * Quiet hours defer interruptive channels (email/teams/sms/push) — urgent
 * bypasses. Returns the time delivery should be attempted, or null for now.
 */
export function quietHoursDeferUntil(
  prefs: Preferences,
  channel: Channel,
  priority: EventPriority,
  now: Date,
): Date | null {
  if (channel === "in_app" || priority === "urgent") return null;
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return null;

  const [sh, sm] = prefs.quietHoursStart.split(":").map(Number);
  const [eh, em] = prefs.quietHoursEnd.split(":").map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const inQuiet =
    start <= end ? mins >= start && mins < end : mins >= start || mins < end;
  if (!inQuiet) return null;

  const until = new Date(now);
  until.setHours(eh, em, 0, 0);
  if (until <= now) until.setDate(until.getDate() + 1); // wrap past midnight
  return until;
}
