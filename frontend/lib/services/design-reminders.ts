import { query } from "@/lib/db";
import { mailConfigured, sendMail } from "@/lib/mail/send";
import { publishEvent } from "@/lib/notifications";
import { writeAudit } from "@/lib/services/audit";
import { BlockingRuleError } from "@/lib/services/blocking";
import type { SessionUser } from "@/lib/auth/session";
import { loadWholeDesignBoard, requireDesignManager } from "@/lib/services/design-tracker";
import {
  buildReminders,
  reminderBody,
  reminderEmail,
  reminderTitle,
  type Reminder,
  type ReminderRules,
} from "@/lib/services/design-reminders-logic";

/**
 * The morning reminders (db/052) — building them is design-reminders-logic.ts;
 * this sends them and keeps the record.
 *
 * Sending order per message: claim the log row first (UNIQUE per day, kind and
 * person — the lock), then the bell, then email. A run that dies half way can
 * be re-run: whatever was claimed is not sent twice, whatever was not is sent.
 */

export type ReminderSettings = ReminderRules & {
  remindersOn: boolean;
  skipSunday: boolean;
  escalateAgainTo: { userId: string; name: string } | null;
};

export type ReminderLogRow = {
  sentFor: string;
  kind: Reminder["kind"];
  recipientName: string;
  items: number;
  emailTo: string | null;
  emailStatus: "pending" | "sent" | "not_configured" | "failed" | "no_address";
  emailDetail: string | null;
  triggeredBy: string;
  at: string;
};

export type ReminderPreview = {
  settings: ReminderSettings;
  today: string;
  mailOn: boolean;
  /** Who would get what if it ran now. */
  messages: (Reminder & { title: string; emailTo: string | null; alreadySent: boolean })[];
  /** Everybody on the board, with the address their reminder goes to. */
  people: { id: string; name: string; role: string; accountEmail: string | null; notifyEmail: string | null }[];
  /** L0 / L1 accounts, for "escalate again to". */
  leaders: { userId: string; name: string }[];
  log: ReminderLogRow[];
};

export type RunResult = {
  ran: boolean;
  reason?: string;
  today: string;
  sent: { kind: Reminder["kind"]; to: string; items: number; email: ReminderLogRow["emailStatus"] }[];
  skippedAlreadySent: number;
};

/** Today in India, and whether it is a Sunday there. */
function indiaDay(): { day: string; sunday: boolean } {
  const d = new Date(Date.now() + 330 * 60_000);
  return { day: d.toISOString().slice(0, 10), sunday: d.getUTCDay() === 0 };
}

async function getReminderSettings(): Promise<ReminderSettings> {
  const [row] = await query<{
    reminders_on: boolean;
    skip_sunday: boolean;
    escalate_after: number;
    escalate_again_after: number;
    escalate_again_to: string | null;
    again_name: string | null;
  }>(
    `SELECT s.reminders_on, s.skip_sunday, s.escalate_after, s.escalate_again_after,
            s.escalate_again_to, u.full_name AS again_name
       FROM ee.design_tracker_settings s
       LEFT JOIN public.users u ON u.id = s.escalate_again_to AND u.is_active
      WHERE s.id = 1`,
  );
  if (!row) throw new BlockingRuleError("The design tracker has no settings row — db/050 is not loaded.");
  return {
    remindersOn: row.reminders_on,
    skipSunday: row.skip_sunday,
    escalateAfter: Number(row.escalate_after),
    escalateAgainAfter: Number(row.escalate_again_after),
    escalateAgainTo:
      row.escalate_again_to && row.again_name ? { userId: row.escalate_again_to, name: row.again_name } : null,
  };
}

async function listReminderPeople() {
  return query<{
    id: string;
    name: string;
    role: "head" | "designer";
    user_id: string | null;
    account_email: string | null;
    notify_email: string | null;
  }>(
    `SELECT p.id, p.name, p.role, p.user_id, u.email AS account_email, p.notify_email
       FROM ee.design_tracker_people p
       LEFT JOIN public.users u ON u.id = p.user_id AND u.is_active
      WHERE p.is_active
      ORDER BY p.sort_order, p.name`,
  );
}

async function buildToday() {
  const [settings, board, peopleRows] = await Promise.all([
    getReminderSettings(),
    loadWholeDesignBoard(),
    listReminderPeople(),
  ]);
  const people = peopleRows.map((p) => ({ id: p.id, name: p.name, role: p.role, userId: p.user_id }));
  const reminders = buildReminders(board.projects, people, settings, settings.escalateAgainTo);

  // Where each goes: the person's own address if set, else their account's.
  const leaderEmail = settings.escalateAgainTo
    ? (
        await query<{ email: string }>(`SELECT email FROM public.users WHERE id = $1`, [
          settings.escalateAgainTo.userId,
        ])
      )[0]?.email ?? null
    : null;
  const addressOf = (r: Reminder): string | null => {
    if (r.kind === "leadership") return leaderEmail;
    const p = peopleRows.find((x) => x.id === r.personId);
    return p?.notify_email?.trim() || p?.account_email || null;
  };

  return { settings, board, peopleRows, reminders, addressOf };
}

export async function previewDesignReminders(user: SessionUser): Promise<ReminderPreview> {
  await requireDesignManager(user);
  const { settings, board, peopleRows, reminders, addressOf } = await buildToday();
  const today = board.settings.today;

  const sentToday = await query<{ kind: string; recipient_user_id: string }>(
    `SELECT kind, recipient_user_id FROM ee.design_reminder_log WHERE sent_for = $1`,
    [indiaDay().day],
  );
  const leaders = await query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM public.users
      WHERE is_active AND access_level IN ('L0', 'L1') ORDER BY access_level, full_name`,
  );

  return {
    settings,
    today,
    mailOn: mailConfigured(),
    messages: reminders.map((r) => ({
      ...r,
      title: reminderTitle(r, settings),
      emailTo: addressOf(r),
      alreadySent: sentToday.some((s) => s.kind === r.kind && s.recipient_user_id === r.recipientUserId),
    })),
    people: peopleRows.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      accountEmail: p.account_email,
      notifyEmail: p.notify_email,
    })),
    leaders: leaders.map((l) => ({ userId: l.id, name: l.full_name })),
    log: await listReminderLog(),
  };
}

async function listReminderLog(): Promise<ReminderLogRow[]> {
  const rows = await query<{
    sent_for: string;
    kind: Reminder["kind"];
    recipient_name: string;
    items: number;
    email_to: string | null;
    email_status: ReminderLogRow["emailStatus"];
    email_detail: string | null;
    triggered_by: string;
    created_at: string;
  }>(
    `SELECT sent_for::text AS sent_for, kind, recipient_name, items, email_to, email_status,
            email_detail, triggered_by, created_at::text AS created_at
       FROM ee.design_reminder_log
      ORDER BY created_at DESC LIMIT 40`,
  );
  return rows.map((r) => ({
    sentFor: r.sent_for.slice(0, 10),
    kind: r.kind,
    recipientName: r.recipient_name,
    items: Number(r.items),
    emailTo: r.email_to,
    emailStatus: r.email_status,
    emailDetail: r.email_detail,
    triggeredBy: r.triggered_by,
    at: r.created_at,
  }));
}

/**
 * Send today's reminders. `trigger` is 'cron' (the 09:00 run — honours
 * "reminders off" and Sundays) or 'manual' (a manager pressing Send now —
 * honours only "off"; pressing it on a Sunday means they want it).
 */
export async function runDesignReminders(trigger: "cron" | "manual", link: string): Promise<RunResult> {
  const { day, sunday } = indiaDay();
  const { settings, reminders, addressOf } = await buildToday();

  if (!settings.remindersOn) return { ran: false, reason: "Reminders are switched off in Setup.", today: day, sent: [], skippedAlreadySent: 0 };
  if (trigger === "cron" && sunday && settings.skipSunday) {
    return { ran: false, reason: "Sunday — skipped, as Setup asks.", today: day, sent: [], skippedAlreadySent: 0 };
  }

  const sent: RunResult["sent"] = [];
  let skippedAlreadySent = 0;

  for (const r of reminders) {
    const emailTo = addressOf(r);
    const [claimed] = await query<{ id: string }>(
      `INSERT INTO ee.design_reminder_log
         (sent_for, kind, recipient_user_id, recipient_name, items, email_to, triggered_by)
       VALUES ($1::date, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sent_for, kind, recipient_user_id) DO NOTHING
       RETURNING id`,
      [day, r.kind, r.recipientUserId, r.recipientName, r.items.length, emailTo, trigger],
    );
    if (!claimed) {
      skippedAlreadySent += 1;
      continue;
    }

    // The bell. Its own dedupe key as well, in case the log was cleared by hand.
    try {
      await publishEvent({
        type: r.kind === "designer" ? "design.reminder" : "design.escalation",
        category: "project",
        entityType: "design_tracker",
        priority: r.kind === "designer" ? "action_required" : "urgent",
        payload: { recipientId: r.recipientUserId, title: reminderTitle(r, settings), body: reminderBody(r) },
        dedupeKey: `design:${r.kind}:${r.recipientUserId}:${day}`,
      });
    } catch (error) {
      console.error("design reminder in-app failed:", error);
    }

    let status: ReminderLogRow["emailStatus"];
    let detail: string | null = null;
    if (!emailTo) {
      status = "no_address";
      detail = "No email address for this person.";
    } else {
      const mail = reminderEmail(r, settings, link);
      const result = await sendMail({ to: emailTo, toName: r.recipientName, ...mail });
      status = result.ok ? "sent" : result.reason === "not_configured" ? "not_configured" : "failed";
      detail = result.ok ? null : result.detail;
    }
    await query(`UPDATE ee.design_reminder_log SET email_status = $2, email_detail = $3 WHERE id = $1`, [
      claimed.id,
      status,
      detail,
    ]);
    sent.push({ kind: r.kind, to: r.recipientName, items: r.items.length, email: status });
  }

  await writeAudit({
    action: "DESIGN_REMINDERS_RUN",
    resourceType: "design_tracker",
    newValues: { trigger, day, sent: sent.length, skippedAlreadySent },
  });

  return { ran: true, today: day, sent, skippedAlreadySent };
}

export async function runDesignRemindersAsManager(user: SessionUser, link: string): Promise<RunResult> {
  await requireDesignManager(user);
  return runDesignReminders("manual", link);
}

export type ReminderSettingsPatch = Partial<{
  remindersOn: boolean;
  skipSunday: boolean;
  escalateAfter: number;
  escalateAgainAfter: number;
  escalateAgainTo: string | null;
}>;

export async function updateReminderSettings(user: SessionUser, patch: ReminderSettingsPatch): Promise<void> {
  await requireDesignManager(user);
  const current = await getReminderSettings();
  const after = patch.escalateAfter ?? current.escalateAfter;
  const again = patch.escalateAgainAfter ?? current.escalateAgainAfter;
  if (again <= after) {
    throw new BlockingRuleError(
      `The second escalation (${again} days) must come after the first (${after} days) — otherwise the same list goes to both on the same morning.`,
    );
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown) => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (patch.remindersOn !== undefined) set("reminders_on", patch.remindersOn);
  if (patch.skipSunday !== undefined) set("skip_sunday", patch.skipSunday);
  if (patch.escalateAfter !== undefined) set("escalate_after", patch.escalateAfter);
  if (patch.escalateAgainAfter !== undefined) set("escalate_again_after", patch.escalateAgainAfter);
  if (patch.escalateAgainTo !== undefined) {
    if (patch.escalateAgainTo !== null) {
      const [leader] = await query<{ id: string }>(
        `SELECT id FROM public.users WHERE id = $1 AND is_active AND access_level IN ('L0', 'L1')`,
        [patch.escalateAgainTo],
      );
      if (!leader) throw new BlockingRuleError("The second escalation goes to a founder or leadership account (L0 / L1).");
    }
    set("escalate_again_to", patch.escalateAgainTo);
  }
  if (sets.length === 0) throw new BlockingRuleError("Nothing to change — the patch was empty.");

  await query(`UPDATE ee.design_tracker_settings SET ${sets.join(", ")}, updated_at = NOW() WHERE id = 1`, values);
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_REMINDER_SETTINGS_UPDATED",
    resourceType: "design_tracker",
    newValues: patch,
  });
}

export async function setNotifyEmail(user: SessionUser, personId: string, email: string | null): Promise<void> {
  await requireDesignManager(user);
  const clean = email?.trim() || null;
  if (clean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new BlockingRuleError(`"${clean}" does not look like an email address.`);
  }
  const rows = await query<{ id: string }>(
    `UPDATE ee.design_tracker_people SET notify_email = $2 WHERE id = $1 RETURNING id`,
    [personId, clean],
  );
  if (rows.length === 0) throw new BlockingRuleError("That person is not on the board.");
  await writeAudit({
    userId: user.id,
    role: user.accessLevel,
    action: "DESIGN_NOTIFY_EMAIL_SET",
    resourceType: "design_tracker",
    resourceId: personId,
    newValues: { email: clean },
  });
}
